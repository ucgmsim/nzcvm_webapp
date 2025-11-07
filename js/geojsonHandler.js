// Functions to handle GeoJSON loading and display on the map

// Variables for GeoJSON overlay
let currentGeoJSONLayer = null;
let legend = null;
let availableModelVersions = [];

// Function to load available model versions from backend and populate dropdown
async function loadAvailableModelVersions() {
    try {
        // Create AbortController for timeout handling (30 seconds for file list)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('model-versions/list', { // New endpoint for model versions
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        availableModelVersions = data.model_versions || [];

        populateModelVersionDropdown();

    } catch (error) {
        console.error('Error loading available model versions:', error);
        if (error.name === 'AbortError') {
            alert('Request timed out while loading available model versions. Please try again.');
        } else {
            alert('Failed to load available model versions from backend. Please check your connection.');
        }
    }
}

// Function to populate model version dropdown based on available model versions
function populateModelVersionDropdown() {
    const dropdown = document.getElementById('model-version');
    dropdown.innerHTML = ''; // Clear existing options

    // Create options based on available model versions
    availableModelVersions.forEach(modelVersion => {
        const option = document.createElement('option');
        option.value = modelVersion.geojson_file; // Use geojson filename as value
        option.textContent = modelVersion.display_version; // Display formatted version
        if (modelVersion.version) {
            option.dataset.modelVersion = modelVersion.version.replace('p', '.');
        }
        dropdown.appendChild(option);
    });
}

// Function to add a legend to the map
function addLegend() {
    if (legend) {
        map.removeControl(legend);
    }

    legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = '<h4>Basin Regions</h4>' +
            '<i class="legend-basin-icon"></i> Basin Areas<br>';
        return div;
    };
    legend.addTo(map);
}

// Function to load and display GeoJSON based on filename
async function loadGeoJSONByModelVersion(filename) {
    // Clear existing GeoJSON layer if any
    if (currentGeoJSONLayer) {
        map.removeLayer(currentGeoJSONLayer);
        currentGeoJSONLayer = null;
        if (legend) {
            map.removeControl(legend);
            legend = null;
        }
    }

    if (!filename || !filename.endsWith('.geojson')) {
        console.warn('Invalid or missing GeoJSON filename:', filename);
        return;
    }

    // Create a loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-indicator';
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerText = 'Loading GeoJSON data...';
    document.getElementById('map-container').appendChild(loadingDiv);

    console.log('Loading GeoJSON:', filename);

    // Retry logic for robustness
    const maxRetries = 3;
    let retryCount = 0;

    async function attemptFetch() {
        try {
            // Create AbortController for timeout handling (60 seconds for GeoJSON data)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            // Fetch from backend
            const response = await fetch(`geojson/${filename}`, {
                signal: controller.signal,
                cache: 'default', // Allow browser caching
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            console.log(`Response status: ${response.status} ${response.statusText}`);
            console.log(`Response headers:`, {
                'content-type': response.headers.get('content-type'),
                'content-encoding': response.headers.get('content-encoding'),
                'content-length': response.headers.get('content-length'),
                'cache-control': response.headers.get('cache-control')
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }

            console.log('Attempting to parse JSON...');
            const data = await response.json();
            console.log(`Successfully parsed JSON with ${Object.keys(data).length} top-level keys`);            // Use performance optimized approach for GeoJSON rendering
            currentGeoJSONLayer = L.geoJSON(data, {
                style: function () {
                    return {
                        color: "#ba0045",
                        weight: 1,
                        fillOpacity: 0.3
                    };
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties && feature.properties.source_file) {
                        layer.bindPopup('Basin Source: ' + feature.properties.source_file);
                    }
                }
            }).addTo(map);

            // Add legend
            addLegend();

            // Remove loading indicator
            if (document.getElementById('loading-indicator')) {
                document.getElementById('loading-indicator').remove();
            }

            // Ensure rectangle stays on top of GeoJSON layer
            if (rectangle) {
                rectangle.bringToFront();
            }

            console.log(`Successfully loaded GeoJSON: ${filename}`);

        } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            console.error(`Error loading GeoJSON (attempt ${retryCount + 1}):`, error);
            console.error(`Error type: ${error.constructor.name}`);
            console.error(`Error stack:`, error.stack);

            if (error.name === 'AbortError') {
                throw new Error('Request timed out while loading GeoJSON data');
            }

            // Retry logic for transient errors
            if (retryCount < maxRetries - 1 &&
                (error.message.includes('400') || error.message.includes('500') ||
                    error.message.includes('CONTENT_LENGTH') || error.message.includes('Failed to fetch'))) {
                retryCount++;
                console.log(`Retrying GeoJSON load (${retryCount}/${maxRetries}) in 1 second...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return attemptFetch();
            }            // Remove loading indicator if it exists
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }

            throw error;
        }
    }

    try {
        await attemptFetch();
    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        console.error('Final error loading GeoJSON:', error);
        alert(`Error loading GeoJSON: ${errorMsg}. Please check console for details.`);
    }
}

// Add change event listener for model version selection
document.getElementById('model-version').addEventListener('change', function () {
    loadGeoJSONByModelVersion(this.value);
});

// Load initial GeoJSON and populate dropdown on page load
document.addEventListener('DOMContentLoaded', async function () {
    // First load available model versions from backend
    await loadAvailableModelVersions();

    // Then load the initial GeoJSON based on the first available option
    const dropdown = document.getElementById('model-version');
    if (dropdown.options.length > 0) {
        loadGeoJSONByModelVersion(dropdown.value);
    }
});