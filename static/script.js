// Updated client-side code for the Gemini Image Generator with Firebase Database Integration

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusMessage = document.getElementById('statusMessage');
    const generatedImage = document.getElementById('generatedImage');
    const promptInput = document.getElementById('promptInput');
    const filenameInput = document.getElementById('filenameInput');
    const promptHistory = document.getElementById('promptHistory');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultTitle = document.querySelector('.result-title');

    // Variables to store current image data for download
    let currentImageData = null;
    let currentFilename = null;
    let savedPrompts = []; // Store fetched prompts

    // Load saved prompts from Firebase database on page load
    loadSavedPrompts();

    // Show status message function
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.style.display = 'block';
        
        // Set color based on message type
        if (type === 'error') {
            statusMessage.style.color = 'red';
            statusMessage.style.borderLeftColor = '#e74c3c';
            statusMessage.style.backgroundColor = '#fdedec';
        } else if (type === 'success') {
            statusMessage.style.color = 'green';
            statusMessage.style.borderLeftColor = '#27ae60';
            statusMessage.style.backgroundColor = '#e8f8f5';
        } else if (type === 'loading') {
            statusMessage.style.color = 'orange';
            statusMessage.style.borderLeftColor = '#f39c12';
            statusMessage.style.backgroundColor = '#fef9e7';
        }
    }

    // Function to fetch saved prompts from Firebase
    async function loadSavedPrompts() {
        try {
            // Show loading in sidebar
            promptHistory.innerHTML = '<div class="empty-history">Loading saved prompts...</div>';
            
            // Make request to your backend endpoint
            const response = await fetch('/get_saved_prompts', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.prompts) {
                savedPrompts = data.prompts;
                displaySavedPrompts();
            } else {
                promptHistory.innerHTML = '<div class="empty-history">No saved prompts found</div>';
            }
            
        } catch (error) {
            console.error('Error loading saved prompts:', error);
            promptHistory.innerHTML = '<div class="empty-history">Error loading prompts</div>';
        }
    }

    // Function to display saved prompts in the sidebar
    // Function to display saved prompts in the sidebar
    function displaySavedPrompts() {
        // Clear current history display
        promptHistory.innerHTML = '';
        
        if (savedPrompts.length === 0) {
            promptHistory.innerHTML = '<div class="empty-history">No saved prompts yet</div>';
            return;
        }
        
        // Add each saved prompt to the sidebar
        savedPrompts.forEach((item, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            // Extract agent name and created date
            const agentName = item.agent_name || 'Unknown Agent';
            
            // Handle different timestamp formats more robustly
            let createdAt;
            let formattedDate = 'Unknown Date';
            
            try {
                if (item.created_at) {
                    // Try different parsing methods
                    if (typeof item.created_at === 'string') {
                        // If it's an ISO string, parse it directly
                        createdAt = new Date(item.created_at);
                    } else if (item.created_at.seconds) {
                        // If it's a Firestore timestamp object with seconds
                        createdAt = new Date(item.created_at.seconds * 1000);
                    } else if (typeof item.created_at === 'number') {
                        // If it's already a timestamp
                        createdAt = new Date(item.created_at);
                    } else {
                        // Try to parse it as-is
                        createdAt = new Date(item.created_at);
                    }
                    
                    // Check if the date is valid
                    if (!isNaN(createdAt.getTime())) {
                        formattedDate = `${createdAt.toLocaleDateString()} ${createdAt.toLocaleTimeString()}`;
                    } else {
                        console.warn('Invalid date for item:', item);
                        formattedDate = 'Invalid Date';
                    }
                } else {
                    formattedDate = 'No Date';
                }
            } catch (error) {
                console.error('Error parsing date:', error, 'for item:', item);
                formattedDate = 'Date Error';
            }
            
            // Create preview of response content (first 80 characters)
            const contentPreview = item.response_content 
                ? (item.response_content.length > 80 
                   ? item.response_content.substring(0, 80) + '...' 
                   : item.response_content)
                : 'No content available';
            
            historyItem.innerHTML = `
                <div style="font-weight: bold; color: #3498db; margin-bottom: 2px;">${agentName}</div>
                <div style="font-size: 0.85em; margin-bottom: 4px;">${contentPreview}</div>
                <span class="timestamp">${formattedDate}</span>
            `;
            
            // Add click event to load this prompt into the input field
            historyItem.addEventListener('click', function() {
                promptInput.value = item.response_content || '';
                
                // Optionally auto-generate a filename from the agent name and timestamp
                if (!filenameInput.value && createdAt && !isNaN(createdAt.getTime())) {
                    const timestamp = createdAt.toISOString().slice(0, 10); // YYYY-MM-DD format
                    filenameInput.value = `${agentName.replace(/\s+/g, '_').toLowerCase()}_${timestamp}`;
                }
                
                // Highlight selected item
                document.querySelectorAll('.history-item').forEach(item => {
                    item.style.backgroundColor = '';
                });
                historyItem.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                
                // Show success message
                showStatus(`Loaded prompt from ${agentName}`, 'success');
            });
            
            promptHistory.appendChild(historyItem);
        });
    }

    // Refresh prompts button functionality (repurpose clear button)
    clearHistoryBtn.addEventListener('click', function() {
        // Change this to refresh prompts instead of clearing
        if (confirm('Refresh saved prompts from database?')) {
            loadSavedPrompts();
        }
    });

    // Update the clear button text and icon
    clearHistoryBtn.innerHTML = '<span>↻</span>';
    clearHistoryBtn.title = 'Refresh Saved Prompts';

    // Function to download image
    function downloadImage() {
        if (!currentImageData || !currentFilename) {
            showStatus('No image available for download.', 'error');
            return;
        }

        try {
            let downloadUrl;
            
            // Check if it's already a data URL or needs conversion
            if (currentImageData.startsWith('data:image')) {
                // It's already a data URL, use it directly
                downloadUrl = currentImageData;
            } else if (currentImageData.startsWith('http')) {
                // It's a Firebase URL - we need to fetch it, but let's show error for now
                showStatus('Cannot download from Firebase URL directly. Please use base64 data.', 'error');
                return;
            } else {
                // It's base64 data, convert to data URL
                downloadUrl = `data:image/png;base64,${currentImageData}`;
            }
            
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = currentFilename || 'generated_image.png';
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showStatus('Image downloaded successfully!', 'success');
        } catch (error) {
            console.error('Download error:', error);
            showStatus('Failed to download image.', 'error');
        }
    }

    // Download button event listener
    downloadBtn.addEventListener('click', downloadImage);

    generateBtn.addEventListener('click', async function() {
        const prompt = promptInput.value.trim();
        const filename = filenameInput.value.trim();

        // Basic validation
        if (!prompt) {
            showStatus('Please enter a prompt for the image.', 'error');
            return;
        }

        // Disable button and update status
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        showStatus('Generating and uploading image...', 'loading');
        
        // Hide previous image and download button while generating
        generatedImage.style.display = 'none';
        resultTitle.style.display = 'none';
        downloadBtn.style.display = 'none';
        
        // Show loading spinner
        loadingSpinner.style.display = 'block';

        try {
            // Make the request with proper headers and error handling
            const response = await fetch('/generate_and_upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    filename: filename
                })
            });

            // Check if response is JSON before trying to parse it
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Received non-JSON response from server: ' + contentType);
            }

            const data = await response.json();

            if (response.ok) {
                let imageLoaded = false;
                
                // Handle different response formats
                if (data.imageUrl && data.image_data) {
                    // Display image from URL (Firebase storage) but use base64 for download
                    generatedImage.onload = function() {
                        // Show the image once it's loaded
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        downloadBtn.style.display = 'inline-block';
                        imageLoaded = true;
                    };
                    generatedImage.src = data.imageUrl;
                    generatedImage.alt = 'Generated Image';
                    
                    // Store base64 data for download (more reliable than Firebase URL)
                    currentImageData = `data:image/png;base64,${data.image_data}`;
                    currentFilename = filename ? `${filename}.png` : 'generated_image.png';
                    
                } else if (data.imageUrl) {
                    // Only Firebase URL available
                    generatedImage.onload = function() {
                        // Show the image once it's loaded
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        downloadBtn.style.display = 'inline-block';
                        imageLoaded = true;
                    };
                    generatedImage.src = data.imageUrl;
                    generatedImage.alt = 'Generated Image';
                    
                    // Store Firebase URL for download
                    currentImageData = data.imageUrl;
                    currentFilename = filename ? `${filename}.png` : 'generated_image.png';
                    
                } else if (data.image_data) {
                    // Display image from base64 data
                    const imageDataUrl = `data:image/png;base64,${data.image_data}`;
                    generatedImage.onload = function() {
                        // Show the image once it's loaded
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        downloadBtn.style.display = 'inline-block';
                        imageLoaded = true;
                    };
                    generatedImage.src = imageDataUrl;
                    generatedImage.alt = 'Generated Image';
                    
                    // Store base64 data for download
                    currentImageData = imageDataUrl;
                    currentFilename = filename ? `${filename}.png` : 'generated_image.png';
                    
                } else {
                    loadingSpinner.style.display = 'none';
                    generatedImage.alt = 'Generated image data received, but no URL was provided.';
                }
                
                // Set a timeout to ensure the image is displayed even if onload doesn't fire
                setTimeout(() => {
                    if (!imageLoaded) {
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        if (currentImageData) {
                            downloadBtn.style.display = 'inline-block';
                        }
                    }
                }, 1000);
                
                showStatus(data.message || 'Image generated successfully!', 'success');
                
                // Add Gemini's text response if available
                if (data.text_response) {
                    const textResponse = document.createElement('p');
                    textResponse.textContent = `${data.text_response}`;
                    textResponse.style.fontStyle = 'italic';
                    textResponse.style.marginTop = '10px';
                    statusMessage.appendChild(textResponse);
                }

                // Refresh the saved prompts after successful generation
                // (in case the new prompt was saved to database)
                setTimeout(() => {
                    loadSavedPrompts();
                }, 1000);
                
            } else {
                loadingSpinner.style.display = 'none';
                showStatus(`Error: ${data.message}`, 'error');
                generatedImage.alt = 'Image generation failed.';
            }
        } catch (error) {
            loadingSpinner.style.display = 'none';
            console.error('Error:', error);
            showStatus(`An error occurred: ${error.message}`, 'error');
            generatedImage.alt = 'An error occurred.';
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate & Upload Image';
        }
    });
});