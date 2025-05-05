// filepath: /home/arr65/src/nzcvm_webapp/js/apiClient.js

// Function to collect all configuration data from the form for config file download
function getConfigurationDataForFile() {
    return {
        'CALL_TYPE': 'GENERATE_VELOCITY_MOD', // Assuming this is fixed for generation
        'MODEL_VERSION': document.getElementById('model-version').value,
        'ORIGIN_LAT': parseFloat(document.getElementById('origin-lat').value).toFixed(6),
        'ORIGIN_LON': parseFloat(document.getElementById('origin-lng').value).toFixed(6),
        'EXTENT_X': parseFloat(document.getElementById('extent-x').value).toFixed(3),
        'EXTENT_Y': parseFloat(document.getElementById('extent-y').value).toFixed(3),
        'EXTENT_ZMAX': parseFloat(document.getElementById('extent-zmax').value).toFixed(1),
        'EXTENT_ZMIN': parseFloat(document.getElementById('extent-zmin').value).toFixed(1),
        'ORIGIN_ROT': parseFloat(document.getElementById('rotation').value).toFixed(1),
        'EXTENT_Z_SPACING': parseFloat(document.getElementById('z-spacing').value).toFixed(1),
        'EXTENT_XY_SPACING': parseFloat(document.getElementById('xy-spacing').value).toFixed(1),
        'MIN_VS': parseFloat(document.getElementById('min-vs').value).toFixed(1),
        'TOPO_TYPE': document.getElementById('topo-type').value,
        'OUTPUT_DIR': document.getElementById('output-dir').value || '/tmp/nzcvm_output' // Ensure a default if empty
    };
}

// Function to download corner coordinates as a config file
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
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = 'Generating model... Please wait.';
    statusMessage.style.color = 'orange';

    // Collect form data for the API request (keys might differ from config file)
    const formData = {
        origin_lat: parseFloat(document.getElementById('origin-lat').value),
        origin_lon: parseFloat(document.getElementById('origin-lng').value),
        extent_x: parseFloat(document.getElementById('extent-x').value),
        extent_y: parseFloat(document.getElementById('extent-y').value),
        extent_XY_spacing: parseFloat(document.getElementById('xy-spacing').value),
        extent_zmax: parseFloat(document.getElementById('extent-zmax').value),
        extent_zmin: parseFloat(document.getElementById('extent-zmin').value),
        rotation: parseFloat(document.getElementById('rotation').value),
        extent_z_spacing: parseFloat(document.getElementById('z-spacing').value),
        min_vs: parseFloat(document.getElementById('min-vs').value),
        model_version: document.getElementById('model-version').value,
        topo_type: document.getElementById('topo-type').value,
        output_dir: document.getElementById('output-dir').value
    };

    try {
        // Send data to backend API endpoint
        const response = await fetch('/run-nzcvm', { // Matches Nginx proxy location
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        if (!response.ok) {
            // Try to get error message from response body
            const errorText = await response.text();
            throw new Error(`Network response was not ok: ${response.statusText}. Server message: ${errorText || 'No details'}`);
        }

        // Check content type before assuming it's a zip
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/zip")) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Create a filename based on parameters or a timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `nzcvm_output_${timestamp}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            statusMessage.textContent = 'Model generated and downloaded successfully!';
            statusMessage.style.color = 'green';
        } else {
            // Handle unexpected content type (e.g., HTML error page)
            const responseText = await response.text();
            console.error('Received unexpected content type:', contentType);
            console.error('Response text:', responseText);
            throw new Error(`Expected a zip file but received ${contentType || 'unknown content type'}.`);
        }

    } catch (error) {
        console.error('Error generating model:', error);
        statusMessage.textContent = `Error: ${error.message}`; // Display detailed error
        statusMessage.style.color = 'red';
    }
}


// Add click event to download config button
document.getElementById('downloadBtn').addEventListener('click', downloadConfigFile);

// Add click event to generate model button
document.getElementById('generateBtn').addEventListener('click', generateModelAndDownload);
