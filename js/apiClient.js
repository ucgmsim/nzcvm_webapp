// Functions to handle API requests and file downloads

// Global variable to hold the timer interval ID
let countdownIntervalId = null;

// Function to collect all configuration data from the form for config file download
function getConfigurationDataForFile() {
    return {
        'CALL_TYPE': 'GENERATE_VELOCITY_MOD', // Assuming this is fixed
        'MODEL_VERSION': document.getElementById('model-version').value,
        'ORIGIN_LAT': parseFloat(document.getElementById('origin-lat').value),
        'ORIGIN_LON': parseFloat(document.getElementById('origin-lon').value),
        'EXTENT_X': parseFloat(document.getElementById('extent-x').value),
        'EXTENT_Y': parseFloat(document.getElementById('extent-y').value),
        'EXTENT_ZMAX': parseFloat(document.getElementById('extent-zmax').value),
        'EXTENT_ZMIN': parseFloat(document.getElementById('extent-zmin').value),
        'ORIGIN_ROT': parseFloat(document.getElementById('rotation').value),
        'EXTENT_Z_SPACING': parseFloat(document.getElementById('z-spacing').value),
        'EXTENT_XY_SPACING': parseFloat(document.getElementById('xy-spacing').value),
        'MIN_VS': parseFloat(document.getElementById('min-vs').value),
        'TOPO_TYPE': document.getElementById('topo-type').value,
        'OUTPUT_DIR': document.getElementById('output-dir').value
    };
}

// Function to download the configuration file
function downloadConfigFile() {
    const configData = getConfigurationDataForFile();

    // Create configuration file content string
    const config = Object.entries(configData)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Create a blob and trigger download
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nzcvm_config.txt'; // Filename for the download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to trigger the backend model generation and download results
async function generateModelAndDownload() {
    // Clear any existing timer interval
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }

    const statusMessage = document.getElementById('status-message');
    statusMessage.style.color = 'orange'; // Set initial color

    // --- Calculate estimated runtime ---
    let estimatedSeconds = 0;
    try {
        // Read values needed for calculation (ensure they exist and are valid)
        const extentX = parseFloat(document.getElementById('extent-x').value);
        const extentY = parseFloat(document.getElementById('extent-y').value);
        const extentLatlonSpacing = parseFloat(document.getElementById('xy-spacing').value); // Renamed from extentLatLonSpacing for consistency
        const extentZmax = parseFloat(document.getElementById('extent-zmax').value);
        const extentZmin = parseFloat(document.getElementById('extent-zmin').value);
        const extentZSpacing = parseFloat(document.getElementById('z-spacing').value);

        // Check if calculateGridPoints and calculateApproxRunTime are available
        if (typeof calculateGridPoints === 'function' && typeof calculateApproxRunTime === 'function') {
            const gridData = calculateGridPoints(extentX, extentY, extentLatlonSpacing, extentZmax, extentZmin, extentZSpacing);
            estimatedSeconds = calculateApproxRunTime(gridData.totalGridPoints);
        } else {
            console.warn("Calculation functions not found. Skipping timer estimation.");
            estimatedSeconds = 0; // Default or skip timer
        }
    } catch (calcError) {
        console.error("Error calculating runtime:", calcError);
        estimatedSeconds = 0; // Default or skip timer on calculation error
    }

    // --- Check if estimated runtime exceeds the limit ---
    if (estimatedSeconds >= 600) {
        statusMessage.innerHTML = 'This website can only generate models that require less than 10 min. Please reduce the number of points in your grid until the run time is less than 10 minutes, or <a href="#" id="download-config-link-for-large-model">download the configuration file</a> and generate the model on your computer.';
        statusMessage.style.color = 'red';
        // Add event listener for the new download link
        const downloadLink = document.getElementById('download-config-link-for-large-model');
        if (downloadLink) {
            downloadLink.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent default link behavior
                downloadConfigFile(); // Call the existing download function
            });
        }
        return; // Stop further execution
    }

    let remainingSeconds = Math.max(0, Math.round(estimatedSeconds)); // Ensure non-negative integer

    // --- Timer Update Function ---
    const updateTimerDisplay = () => {
        if (remainingSeconds >= 0) {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            statusMessage.textContent = `Generating model. Estimated time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            statusMessage.style.color = 'chocolate';
        } else {
            // Timer has run out
            statusMessage.textContent = 'Generation taking longer than expected. Please wait.';
            statusMessage.style.color = 'chocolate';
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId); // Stop the interval
                countdownIntervalId = null;
            }
        }
    };

    // --- Start Timer ---
    if (remainingSeconds > 0) {
        updateTimerDisplay(); // Initial display
        countdownIntervalId = setInterval(() => {
            remainingSeconds--;
            updateTimerDisplay();
        }, 1000);
    } else {
        // If estimate is 0 or calculation failed, show generic message
        statusMessage.textContent = 'Generating model... Please wait.';
    }

    // Collect form data for the API request
    const formData = {
        CALL_TYPE: 'GENERATE_VELOCITY_MOD',
        MODEL_VERSION: document.getElementById('model-version').value,
        ORIGIN_LAT: parseFloat(document.getElementById('origin-lat').value),
        ORIGIN_LON: parseFloat(document.getElementById('origin-lon').value),
        ORIGIN_ROT: parseFloat(document.getElementById('rotation').value),
        EXTENT_X: parseFloat(document.getElementById('extent-x').value),
        EXTENT_Y: parseFloat(document.getElementById('extent-y').value),
        EXTENT_ZMAX: parseFloat(document.getElementById('extent-zmax').value),
        EXTENT_ZMIN: parseFloat(document.getElementById('extent-zmin').value),
        EXTENT_Z_SPACING: parseFloat(document.getElementById('z-spacing').value),
        EXTENT_LATLON_SPACING: parseFloat(document.getElementById('xy-spacing').value), // Use the key expected by nzcvm.py config
        MIN_VS: parseFloat(document.getElementById('min-vs').value),
        TOPO_TYPE: document.getElementById('topo-type').value,
        OUTPUT_DIR: document.getElementById('output-dir').value || '/tmp/nzcvm_output' // Ensure default if empty
    };


    try {
        // Send data to backend API endpoint
        const response = await fetch('/nzcvm_webapp/run-nzcvm', { // Matches Nginx proxy location
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        if (!response.ok) {
            // Clear timer on network error before throwing
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                countdownIntervalId = null;
            }
            // Try to get error message from response body
            const errorText = await response.text();
            throw new Error(`Network response was not ok: ${response.statusText}. Server message: ${errorText || 'No details'}`);
        }

        // Check content type before assuming it's a zip
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/zip")) {
            // Clear timer on success before download starts
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                countdownIntervalId = null;
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Create a filename based on a timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `nzcvm_output_${timestamp}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            statusMessage.innerHTML = 'Model generated and downloaded successfully! <a href="https://github.com/ucgmsim/velocity_modelling/blob/main/wiki/OutputFormats.md#hdf5-file-structure" target="_blank" rel="noopener noreferrer">click here</a> for information about the output format.';
            statusMessage.style.color = 'green';
        } else {
            // Clear timer on unexpected content type
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                countdownIntervalId = null;
            }
            // Handle unexpected content type (e.g., HTML error page)
            const responseText = await response.text();
            console.error('Received unexpected content type:', contentType);
            console.error('Response text:', responseText);
            throw new Error(`Expected a zip file but received ${contentType || 'unknown content type'}.`);
        }

    } catch (error) {
        // Clear timer on any caught error
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
        }
        console.error('Error generating model:', error);
        statusMessage.textContent = `Error: ${error.message}`; // Display detailed error
        statusMessage.style.color = 'red';
    }
}


// Add click event to download config button
document.getElementById('downloadBtn').addEventListener('click', downloadConfigFile);

// Add click event to generate model button
document.getElementById('generateBtn').addEventListener('click', generateModelAndDownload);