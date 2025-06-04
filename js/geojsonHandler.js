// Functions to handle GeoJSON loading and display on the map

// Variables for GeoJSON overlay
let currentGeoJSONLayer = null;
let legend = null;
let availableGeoJSONFiles = [];

// Function to load available GeoJSON files from backend and populate dropdown
async function loadAvailableGeoJSONFiles() {
    try {
        const response = await fetch('geojson/list'); // Relative path since we're served from /nzcvm_webapp/
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        availableGeoJSONFiles = data.files || [];

        // Populate the model version dropdown with available files
        populateModelVersionDropdown();

    } catch (error) {
        console.error('Error loading available GeoJSON files:', error);
        alert('Failed to load available GeoJSON files from backend. Please check your connection.');
    }
}

// Function to populate model version dropdown based on available files
function populateModelVersionDropdown() {
    const dropdown = document.getElementById('model-version');
    dropdown.innerHTML = ''; // Clear existing options

    // Create options based on available files
    availableGeoJSONFiles.forEach(filename => {
        // Extract version from filename (e.g., "model_version_2p03_basins.geojson.gz" -> "2.03")
        const versionMatch = filename.match(/model_version_(\d+)p(\d+)/);
        if (versionMatch) {
            const version = `${versionMatch[1]}.${versionMatch[2]}`;
            const option = document.createElement('option');
            option.value = filename; // Store the full filename as value
            option.textContent = version; // Display the version number
            dropdown.appendChild(option);
        }
    });
}
function addLegend() {
    if (legend) {
        map.removeControl(legend);
    }

    legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = '<h4>Basin Regions</h4>' +
            '<i style="background:#ba0045"></i> Basin Areas<br>';
        return div;
    };
    legend.addTo(map);
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
            '<i style="background:#ba0045"></i> Basin Areas<br>';
        return div;
    };
    legend.addTo(map);
}

// Function to load and display GeoJSON based on filename
function loadGeoJSONByModelVersion(filename) {
    // Clear existing GeoJSON layer if any
    if (currentGeoJSONLayer) {
        map.removeLayer(currentGeoJSONLayer);
        currentGeoJSONLayer = null;
        if (legend) {
            map.removeControl(legend);
            legend = null;
        }
    }

    if (!filename || !filename.endsWith('.geojson.gz')) {
        console.warn('Invalid or missing compressed GeoJSON filename:', filename);
        return;
    }

    // Create a loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-indicator';
    loadingDiv.style.position = 'absolute';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.background = 'white';
    loadingDiv.style.padding = '10px';
    loadingDiv.style.borderRadius = '5px';
    loadingDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    loadingDiv.style.zIndex = '1000';
    loadingDiv.innerText = 'Loading GeoJSON data...';
    document.getElementById('map-container').appendChild(loadingDiv);

    console.log('Loading GeoJSON:', filename);

    // Fetch from backend
    fetch(`geojson/${filename}`) // Relative path since we're served from /nzcvm_webapp/
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            return response.json(); // Backend response is already decompressed JSON
        })
        .then(data => {
            // Use performance optimized approach for GeoJSON rendering
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
        })
        .catch(error => {
            const errorMsg = error.message || 'Unknown error';
            console.error('Error loading GeoJSON:', error);

            // Remove loading indicator if it exists
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            alert(`Error loading GeoJSON: ${errorMsg}. Please check console for details.`);
        });
}

// Add change event listener for model version selection
document.getElementById('model-version').addEventListener('change', function () {
    loadGeoJSONByModelVersion(this.value);
});

// Load initial GeoJSON and populate dropdown on page load
document.addEventListener('DOMContentLoaded', async function () {
    // First load available files from backend
    await loadAvailableGeoJSONFiles();

    // Then load the initial GeoJSON based on the first available option
    const dropdown = document.getElementById('model-version');
    if (dropdown.options.length > 0) {
        loadGeoJSONByModelVersion(dropdown.value);
    }
});