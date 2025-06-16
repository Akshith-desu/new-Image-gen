import os
import io
from datetime import datetime
import re
import json
from flask import Flask, render_template, jsonify, request, send_from_directory
from dotenv import load_dotenv

from google import genai
from google.ai import generativelanguage_v1beta as gen_language
from google.genai import types
import base64

from PIL import Image
from firebase_admin import credentials, initialize_app, storage, firestore
import firebase_admin
from google.cloud import secretmanager

# Load environment variables
load_dotenv()
api_key = os.environ.get('GEMINI_API_KEY')

# Initialize Flask app
app = Flask(__name__)
firebase_bucket = None  # Global variable for Firebase bucket
db = None  # Global variable for Firestore database

# Firebase configuration
PROJECT_ID = "image-gen-34b6b"
SECRET_ID = "firebase-agents-creds"
SECRET_VERSION_ID = "latest"

def access_secret_version(project_id, secret_id, version_id):
    """Access the secret version and return its payload."""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode('UTF-8')
    except Exception as e:
        print(f"Error accessing Secret Manager secret '{secret_id}': {e}")
        return None

def initialize_firebase():
    """
    Initializes the Firebase Admin SDK and gets the storage bucket and Firestore database.
    """
    global firebase_bucket, db
    
    if not firebase_admin._apps:
        print("Attempting to initialize Firebase Admin SDK...")
        credentials_json_string = None
        cred = None

        # Step 1: Try to use base64 credentials from Render env
        if "FIREBASE_CREDS_B64" in os.environ:
            print("🔐 Using base64 credentials from FIREBASE_CREDS_B64...")
            try:
                decoded = base64.b64decode(os.environ["FIREBASE_CREDS_B64"])
                credentials_dict = json.loads(decoded)
                cred = credentials.Certificate(credentials_dict)
                firebase_app = initialize_app(
                    cred,
                    {'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET') or 'image-gen-34b6b.appspot.com'},
                )
                print("✅ Firebase initialized using FIREBASE_CREDS_B64")
            except Exception as e:
                print(f"❌ Failed to decode FIREBASE_CREDS_B64: {e}")
                cred = None

        # Step 2: Try Secret Manager (if base64 not used or failed)
        elif PROJECT_ID and SECRET_ID and SECRET_VERSION_ID:
            print("🔐 Attempting Firebase init using Google Secret Manager...")
            credentials_json_string = access_secret_version(PROJECT_ID, SECRET_ID, SECRET_VERSION_ID)
            if credentials_json_string:
                try:
                    cred = credentials.Certificate(json.loads(credentials_json_string))
                    firebase_app = initialize_app(
                        cred,
                        {'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET') or 'image-gen-34b6b.appspot.com'},
                    )
                    print("✅ Firebase initialized using Secret Manager credentials.")
                except Exception as e:
                    print(f"❌ Failed to init Firebase with Secret Manager: {str(e)}")
        
        # Step 3: Fallback to local file
        if cred is None:
            print("⚠️ Falling back to local service_account_key.json...")
            try:
                cred = credentials.Certificate("service_account_key.json")
                firebase_app = initialize_app(
                    cred,
                    {'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET') or 'image-gen-34b6b.appspot.com'},
                )
                print("✅ Firebase initialized using local service_account_key.json")
            except Exception as e_file:
                print(f"❌ Failed to use service_account_key.json: {str(e_file)}")
                print("Attempting to initialize Firebase with application default credentials...")
                try:
                    firebase_app = initialize_app({
                        'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET') or 'image-gen-34b6b.appspot.com'
                    })
                    print("✅ Firebase initialized using application default credentials.")
                except Exception as e_default:
                    print(f"❌ Firebase initialization failed completely: {str(e_default)}")
                    return

        # Initialize storage bucket
        try:
            firebase_bucket = storage.bucket(app=firebase_admin.get_app())
            print("✅ Connected to Firebase Storage")
        except Exception as e:
            print(f"❌ Error getting Firebase bucket: {e}")

        # Initialize Firestore database
        try:
            db = firestore.client(database_id="prompts-saved")
            print("✅ Connected to Firestore database")
        except Exception as e:
            print(f"❌ Error connecting to Firestore: {str(e)}")
            print("Firestore client could not be created.")
    else:
        print("ℹ️ Firebase already initialized.")
        try:
            firebase_bucket = storage.bucket(app=firebase_admin.get_app())
            db = firestore.client(database_id="prompts-saved")
            print("✅ Connected to existing Firebase services")
        except Exception as e:
            print(f"❌ Error accessing existing Firebase services: {e}")


def gen_image(prompt: str):
    """
    Generates an image using the Gemini API based on a text prompt.
    Returns image data (bytes) and text response.
    """
    if not api_key:
        return None, "Error: GEMINI_API_KEY not set."
    if not prompt or not prompt.strip():
        return None, "Error: Image prompt is empty."
    try:
        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp-image-generation",
            contents=prompt,
            config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE']),
        )
        image_data = None
        text_response = ""

        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.text is not None:
                    text_response += part.text
                elif part.inline_data is not None:
                    image_data = part.inline_data.data

        if image_data is None:
            error_message = "Image generation failed or returned no image."
            # Check for safety ratings.  This check was improved.
            if response.candidates and hasattr(response.candidates[0], 'safety_ratings'):
                safety_ratings = response.candidates[0].safety_ratings
                blocked = any(r.blocked for r in safety_ratings)  # Simpler check
                if blocked:
                    error_message += " (Reason: May have been blocked by safety filters)"
            if text_response:
                error_message += f" Text response: {text_response}"
            return None, error_message

        print("Image generated successfully (bytes received).")
        if text_response:
            print(f"Gemini Text Response: {text_response}")

        return image_data, text_response

    except Exception as e:
        print(f"Error during image generation: {e}")
        return None, f"Error during image generation: {e}"


@app.route('/', methods=['GET'])
def index():
    """Renders the main HTML page."""
    return render_template('index.html')  # You'll need an index.html in a 'templates' folder

@app.route('/generate_and_upload', methods=['POST'])
def generate_and_upload():
    """
    Endpoint to generate an image and upload it to Firebase storage.
    Returns JSON response with the image URL and base64 data for download.
    """
    if request.method != 'POST':
        return jsonify({'status': 'error', 'message': 'Invalid request method. Use POST.'}), 405

    # Check if the request has the correct Content-Type
    if request.headers.get('Content-Type') != 'application/json':
        return jsonify({
            'status': 'error', 
            'message': 'Invalid Content-Type. Use application/json.'
        }), 400

    try:
        request_data = request.get_json()
        if request_data is None:
            return jsonify({
                'status': 'error', 
                'message': 'Invalid request: No JSON body provided or invalid JSON format.'
            }), 400

        prompt = request_data.get('prompt', '').strip()
        if not prompt:
            return jsonify({'status': 'error', 'message': 'Please provide a prompt for the image.'}), 400

        # Get filename from request or generate one
        base_filename = request_data.get('filename', '').strip()
        if not base_filename:
            # Generate a filename based on prompt (first 20 chars) if none provided
            base_filename = re.sub(r'[^\w\s-]', '', prompt[:20]).strip().replace(' ', '_').lower()
        
        # Add timestamp for uniqueness
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{base_filename}_{timestamp}.png"

        # Generate the image
        image_data, text_response = gen_image(prompt)
        if not image_data:
            return jsonify({'status': 'error', 'message': text_response}), 500

        # Always convert to base64 for download functionality
        image_base64 = base64.b64encode(image_data).decode('utf-8')

        # If Firebase is initialized, upload the image
        if firebase_bucket:
            try:
                # Create a file-like object from the image data
                image_file = io.BytesIO(image_data)
                
                # Upload to Firebase Storage
                blob = firebase_bucket.blob(filename)
                blob.upload_from_file(image_file, content_type='image/png')
                
                # Make the blob publicly accessible
                blob.make_public()
                
                # Get the public URL
                image_url = blob.public_url
                
                return jsonify({
                    'status': 'success',
                    'message': 'Image generated successfully!',
                    'imageUrl': image_url,
                    'image_data': image_base64,  # Always include base64 for download
                    'text_response': text_response
                }), 200
            except Exception as e:
                print(f"Error uploading to Firebase: {e}")
                # If upload fails, fallback to returning base64 data only
                return jsonify({
                    'status': 'partial_success',
                    'message': f'Image generated : {e}',
                    'image_data': image_base64,
                    'text_response': text_response
                }), 200
        else:
            # Firebase not initialized, return base64 data
            return jsonify({
                'status': 'success',
                'message': 'Image generated successfully!',
                'image_data': image_base64,
                'text_response': text_response
            }), 200
    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({'status': 'error', 'message': f'Error processing request: {e}'}), 500


@app.route('/generate_image', methods=['POST'])
def generate_image_route():
    """
    Legacy endpoint to trigger image generation. Returns JSON response with image data.
    """
    if request.method != 'POST':
        return jsonify({'status': 'error', 'message': 'Invalid request method. Use POST.'}), 405

    # Check if the request has the correct Content-Type
    if request.headers.get('Content-Type') != 'application/json':
        return jsonify({
            'status': 'error', 
            'message': 'Invalid Content-Type. Use application/json.'
        }), 400

    try:
        request_data = request.get_json()
        if request_data is None:
            return jsonify({
                'status': 'error', 
                'message': 'Invalid request: No JSON body provided or invalid JSON format.'
            }), 400

        prompt = request_data.get('prompt', '').strip()
        if not prompt:
            return jsonify({'status': 'error', 'message': 'Please provide a prompt for the image.'}), 400

        image_data, text_response = gen_image(prompt)  # Get image data and text
        if not image_data:
            return jsonify({'status': 'error', 'message': text_response}), 500  # Return the error from gen_image

        # Convert image data to base64 for sending in JSON.  This is suitable for smaller images.
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        return jsonify({
            'status': 'success',
            'message': 'Image generated successfully!',
            'image_data': image_base64,  # Send base64 encoded image data
            'text_response': text_response
        }), 200
    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({'status': 'error', 'message': f'Error processing request: {e}'}), 500

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files (like CSS, JS)."""
    return send_from_directory('static', filename)

@app.route('/get_saved_prompts', methods=['GET'])
def get_saved_prompts():
    """
    Endpoint to fetch all saved prompts from Firebase database
    Returns prompts in format suitable for frontend display
    """
    try:
        if not db:
            return jsonify({
                'success': False,
                'message': 'Database connection not available',
                'prompts': []
            }), 500

        # Get all saved prompts from the agent_responses collection
        agent_responses_ref = db.collection('agent_responses')
        docs = agent_responses_ref.order_by('created_at', direction=firestore.Query.DESCENDING).stream()
        
        prompts_list = []
        
        for doc in docs:
            doc_data = doc.to_dict()
            
            # Handle Firestore timestamp conversion
            created_at = doc_data.get('created_at')
            if created_at:
                # Convert Firestore timestamp to ISO string for JavaScript
                if hasattr(created_at, 'timestamp'):
                    # It's a Firestore timestamp object
                    created_at_iso = created_at.isoformat()
                elif hasattr(created_at, 'seconds'):
                    # It's a timestamp dict with seconds and nanoseconds
                    import datetime
                    created_at_iso = datetime.datetime.fromtimestamp(created_at.seconds).isoformat()
                else:
                    # Fallback - assume it's already a datetime or string
                    created_at_iso = str(created_at)
            else:
                # Use current time as fallback
                from datetime import datetime
                created_at_iso = datetime.now().isoformat()
            
            # Extract relevant fields
            prompt_data = {
                'id': doc.id,
                'agent_name': doc_data.get('agent_name', 'Unknown Agent'),
                'response_content': doc_data.get('response_content', ''),
                'created_at': created_at_iso,  # Send as ISO string
                'prompt_text': doc_data.get('prompt_text', ''),  # If you store original prompts
            }
            
            prompts_list.append(prompt_data)
        
        return jsonify({
            'success': True,
            'message': f'Found {len(prompts_list)} saved prompts',
            'prompts': prompts_list
        })
        
    except Exception as e:
        print(f"Error fetching saved prompts: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching saved prompts: {str(e)}',
            'prompts': []
        }), 500


@app.route('/get_prompt/<prompt_id>', methods=['GET'])
def get_specific_prompt(prompt_id):
    """
    Endpoint to fetch a specific prompt by its document ID
    """
    try:
        if not db:
            return jsonify({
                'success': False,
                'message': 'Database connection not available'
            }), 500

        # Get specific document
        doc_ref = db.collection('agent_responses').document(prompt_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            return jsonify({
                'success': False,
                'message': 'Prompt not found'
            }), 404
            
        doc_data = doc.to_dict()
        
        # Handle Firestore timestamp conversion
        created_at = doc_data.get('created_at')
        if created_at:
            # Convert Firestore timestamp to ISO string for JavaScript
            if hasattr(created_at, 'timestamp'):
                # It's a Firestore timestamp object
                created_at_iso = created_at.isoformat()
            elif hasattr(created_at, 'seconds'):
                # It's a timestamp dict with seconds and nanoseconds
                import datetime
                created_at_iso = datetime.datetime.fromtimestamp(created_at.seconds).isoformat()
            else:
                # Fallback - assume it's already a datetime or string
                created_at_iso = str(created_at)
        else:
            # Use current time as fallback
            from datetime import datetime
            created_at_iso = datetime.now().isoformat()
        
        prompt_data = {
            'id': doc.id,
            'agent_name': doc_data.get('agent_name', 'Unknown Agent'),
            'response_content': doc_data.get('response_content', ''),
            'created_at': created_at_iso,  # Send as ISO string
            'prompt_text': doc_data.get('prompt_text', ''),
        }
        
        return jsonify({
            'success': True,
            'prompt': prompt_data
        })
        
    except Exception as e:
        print(f"Error fetching specific prompt: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error fetching prompt: {str(e)}'
        }), 500
if __name__ == '__main__':
    initialize_firebase()  # Initialize Firebase (for both storage and database)
    app.run(debug=True) #, host='0.0.0.0'