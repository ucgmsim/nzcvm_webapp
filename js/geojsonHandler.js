// Functions to handle GeoJSON loading and display on the map

// Variables for GeoJSON overlay
let currentGeoJSONLayer = null;
let legend = null;

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

// Function to load and display GeoJSON based on model version
function loadGeoJSONByModelVersion(modelVersion) {
    // Clear existing GeoJSON layer if any
    if (currentGeoJSONLayer) {
        map.removeLayer(currentGeoJSONLayer);
        currentGeoJSONLayer = null;
        if (legend) {
            map.removeControl(legend);
            legend = null;
        }
    }

    // Map model version to corresponding GeoJSON file
    let filename = '';
    if (modelVersion === '2.03') {
        filename = 'model_version_2p03_basins.geojson.gz';
    } else if (modelVersion === '2.07') {
        filename = 'model_version_2p07_basins.geojson.gz';
    } else {
        console.warn('No GeoJSON defined for model version:', modelVersion);
        return; // Don't try to load if no file is defined
    }

    // Updated path to GeoJSON files with new structure
    const geoJsonUrl = 'data/basins/' + filename;

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

    console.log('Loading GeoJSON from:', geoJsonUrl);

    // Fetch the GeoJSON file
    fetch(geoJsonUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            return response.body;
        })
        .then(rs => {
            // Check if browser supports DecompressionStream
            if (typeof DecompressionStream === 'undefined') {
                throw new Error('Browser does not support DecompressionStream for Gzip.');
            }
            return rs.pipeThrough(new DecompressionStream("gzip"));
        })
        .then(rs => {
            return new Response(rs).json();
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
            alert(`Error loading GeoJSON: ${errorMsg}. Check console for details.`);
        });
}

// Add change event listener for model version selection
document.getElementById('model-version').addEventListener('change', function () {
    loadGeoJSONByModelVersion(this.value);
});

// Load initial GeoJSON based on default selected model version
document.addEventListener('DOMContentLoaded', function () {
    const initialModelVersion = document.getElementById('model-version').value;
    loadGeoJSONByModelVersion(initialModelVersion);
});