// Improved client-side code for the Gemini Image Generator with Prompt History

document.addEventListener('DOMContentLoaded', function() {
    const generateBtn = document.getElementById('generateBtn');
    const statusMessage = document.getElementById('statusMessage');
    const generatedImage = document.getElementById('generatedImage');
    const promptInput = document.getElementById('promptInput');
    const filenameInput = document.getElementById('filenameInput');
    const promptHistory = document.getElementById('promptHistory');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultTitle = document.querySelector('.result-title');

    // Load existing prompt history from localStorage
    loadPromptHistory();

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

    // Function to save prompt to history
    function savePromptToHistory(prompt) {
        // Don't save empty prompts
        if (!prompt.trim()) return;
        
        // Get existing history or initialize empty array
        let history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
        
        // Create new history item with timestamp
        const newItem = {
            prompt: prompt,
            timestamp: new Date().toISOString()
        };
        
        // Add to beginning of array (most recent first)
        history.unshift(newItem);
        
        // Keep only the most recent 50 prompts
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        // Save back to localStorage
        localStorage.setItem('promptHistory', JSON.stringify(history));
        
        // Update the UI
        loadPromptHistory();
    }

    // Function to load and display prompt history
    function loadPromptHistory() {
        const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
        
        // Clear current history display
        promptHistory.innerHTML = '';
        
        if (history.length === 0) {
            promptHistory.innerHTML = '<div class="empty-history">No prompt history yet</div>';
            return;
        }
        
        // Add each history item to the sidebar
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            // Format the timestamp
            const date = new Date(item.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            historyItem.innerHTML = `
                ${item.prompt}
                <span class="timestamp">${formattedDate}</span>
            `;
            
            // Add click event to use this prompt
            historyItem.addEventListener('click', function() {
                promptInput.value = item.prompt;
                // Optionally auto-generate a filename from the prompt
                if (!filenameInput.value) {
                    filenameInput.value = item.prompt.substring(0, 20)
                        .replace(/[^\w\s-]/g, '')
                        .trim()
                        .replace(/\s+/g, '_')
                        .toLowerCase();
                }
            });
            
            promptHistory.appendChild(historyItem);
        });
    }

    // Clear history button
    clearHistoryBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear your prompt history?')) {
            localStorage.removeItem('promptHistory');
            loadPromptHistory();
        }
    });

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
        
        // Hide previous image while generating
        generatedImage.style.display = 'none';
        resultTitle.style.display = 'none';
        
        // Show loading spinner
        loadingSpinner.style.display = 'block';

        try {
            // Save this prompt to history before making the request
            savePromptToHistory(prompt);
            
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
                if (data.imageUrl) {
                    // Display image from URL (Firebase storage)
                    generatedImage.onload = function() {
                        // Show the image once it's loaded
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        imageLoaded = true;
                    };
                    generatedImage.src = data.imageUrl;
                    generatedImage.alt = 'Generated Image';
                } else if (data.image_data) {
                    // Display image from base64 data
                    generatedImage.onload = function() {
                        // Show the image once it's loaded
                        loadingSpinner.style.display = 'none';
                        generatedImage.style.display = 'block';
                        resultTitle.style.display = 'block';
                        imageLoaded = true;
                    };
                    generatedImage.src = `data:image/png;base64,${data.image_data}`;
                    generatedImage.alt = 'Generated Image';
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
                    }
                }, 1000);
                
                showStatus(data.message || 'Image generated successfully!', 'success');
                
                // Add Gemini's text response if available
                if (data.text_response) {
                    const textResponse = document.createElement('p');
                    textResponse.textContent = `Gemini says: ${data.text_response}`;
                    textResponse.style.fontStyle = 'italic';
                    textResponse.style.marginTop = '10px';
                    statusMessage.appendChild(textResponse);
                }
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