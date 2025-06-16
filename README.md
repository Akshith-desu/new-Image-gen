# Image Generator

A Flask-based web application that generates images using Google's Gemini 2.0 Flash Image Generation model. Users can input text prompts and receive AI-generated images that can be downloaded locally.

## Features

- **AI Image Generation**: Uses Google Gemini 2.0 Flash experimental image generation model
- **Web Interface**: Clean, responsive web UI for easy interaction
- **Image Download**: Generated images can be downloaded as PNG files
- **Real-time Status**: Loading indicators and status messages for better UX
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Python 3.11.0 (recommended)
- Google Gemini API key
- Firebase project (optional - currently not functional for image storage)

## Installation

### Local Development

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd image-generator
   ```

2. **Set up Python environment**

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Firebase Setup (Optional)**

   - Create a Firebase project
   - Generate a service account key
   - Save it as `service_account_key.json` in the root directory
   - Note: Firebase image storage is currently not functional

6. **Run the application**

   ```bash
   python app.py
   ```

   The application will be available at `http://localhost:5000`

## Usage

1. Open the web application in your browser
2. Enter a descriptive prompt for the image you want to generate
3. Optionally provide a filename (timestamp will be added automatically)
4. Click "Generate Image" and wait for the AI to create your image
5. Once generated, you can download the image using the "Download Image" button

### Example Prompts

- "A heavy machinery steel cutter in a factory environment"
- "A sunset over a mountain range with wildflowers"
- "A futuristic cityscape with flying cars"
- "A cozy coffee shop in the rain"

## Project Structure

```
├── app.py                 # Main Flask application
├── IMAGE.PY              # Standalone image generation script
├── db_fetch.py           # Firebase database operations (legacy)
├── templates/
│   └── index.html        # Main web interface
├── static/
│   ├── styles.css        # Application styling
│   └── script.js         # Frontend JavaScript
├── requirements.txt      # Python dependencies
├── .env                  # Environment variables (create this)
├── .gitignore           # Git ignore rules
├── Procfile             # Heroku/Render deployment config
└── render.yaml          # Render deployment config
```

## API Endpoints

### `POST /generate_and_upload`

Generates an image from a text prompt.

**Request Body:**

```json
{
  "prompt": "Your image description here",
  "filename": "optional_filename"
}
```

**Response:**

```json
{
  "status": "success",
  "message": "Image generated successfully!",
  "image_data": "base64_encoded_image_data",
  "text_response": "Optional text from Gemini"
}
```

### `POST /generate_image`

Legacy endpoint for image generation (returns base64 data only).

## Configuration

### Environment Variables

| Variable                  | Description                  | Required |
| ------------------------- | ---------------------------- | -------- |
| `GEMINI_API_KEY`          | Google Gemini API key        | Yes      |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket name | No       |

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Create a new API key
4. Add the key to your `.env` file

## Deployment

### Render.com

The application is configured for deployment on Render.com:

1. Connect your GitHub repository to Render
2. Set the following environment variables in Render:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `FIREBASE_CREDS_B64`: Base64 encoded Firebase credentials (optional)
3. Deploy using the provided `render.yaml` configuration

### Other Platforms

For deployment on other platforms (Heroku, Railway, etc.), ensure you:

- Set the required environment variables
- Use the provided `Procfile` for process configuration
- Install all dependencies from `requirements.txt`

## Known Issues & Limitations

1. **Firebase Integration**: Firebase image storage and prompt history features are currently non-functional
2. **Prompt History**: The sidebar shows prompts from a different project - developers should modify this for local use
3. **Image Storage**: Images are not saved server-side; only available for download
4. **API Limits**: Subject to Google Gemini API rate limits and quotas

## Development Notes

- The application uses Google's experimental image generation model, which may have limitations
- Images are generated as PNG format by default
- The frontend uses vanilla JavaScript with no external frameworks
- Firebase-related code is present but not functional for image operations

## Troubleshooting

### Common Issues

1. **"GEMINI_API_KEY not found"**

   - Ensure your `.env` file contains the correct API key
   - Verify the API key is valid and has proper permissions

2. **Image generation fails**

   - Check your internet connection
   - Verify the Gemini API service is available
   - Ensure your prompt doesn't violate content policies

3. **Download not working**
   - Ensure your browser allows downloads
   - Try using a different browser
   - Check browser console for JavaScript errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

.
