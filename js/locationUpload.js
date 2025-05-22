// Functions for station file uploads

// Variables for location markers from uploaded files
let locationMarkers = [];
let locationMarkersLayer = null;

// Function to handle file upload for location data
function handleLocationFileUpload(event) {
    const file = event.target.files[0];

    // If no file is selected (e.g., user cancels the dialog)
    if (!file) {
        console.log("No file selected.");
        return;
    }

    // A file was selected, clear previous markers
    clearLocationMarkers(false);

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const fileContent = e.target.result;
            const isLLFile = file.name.toLowerCase().endsWith('.ll');
            const locations = parseLocationFile(isLLFile, fileContent);
            displayLocationMarkers(locations);
        } catch (error) {
            console.error("Error processing location file:", error);
            alert(`Error processing file: ${error.message}`);
            clearLocationMarkers(true); // Reset input on error
        }
    };
    reader.onerror = function (e) {
        console.error("Error reading file:", e);
        alert("Error reading file.");
        clearLocationMarkers(true); // Reset input on error
    };
    reader.readAsText(file);
}

// Function to parse the location file content
function parseLocationFile(isLLFile, fileContent) {
    const fileHasHeaders = !isLLFile && document.getElementById('file-has-headers').checked;
    let locations = [];

    if (isLLFile) {
        // Simple space/tab delimited parsing for .ll
        const lines = fileContent.trim().split('\n');
        locations = lines.map((line, index) => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) {
                throw new Error(`Invalid format in .ll file on line ${index + 1}`);
            }
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            const name = parts[2] || `Location ${index + 1}`;
            if (isNaN(lon) || isNaN(lat)) {
                throw new Error(`Invalid coordinates in .ll file on line ${index + 1}`);
            }
            return { lon, lat, name };
        });
    } else {
        // Use PapaParse for CSV
        const locations_results = Papa.parse(fileContent, {
            header: fileHasHeaders,
            dynamicTyping: true,
            skipEmptyLines: true,
            transformHeader: header => header.trim()
        });

        if (locations_results.errors.length > 0) {
            console.error("CSV Parsing Errors:", locations_results.errors);
            throw new Error(`CSV Parsing Error: ${locations_results.errors[0].message}`);
        }

        locations = locations_results.data;

        if (!fileHasHeaders) {
            // Assume order is lon, lat, name if no headers
            locations = locations.map((row, index) => {
                if (!Array.isArray(row) || row.length < 2) {
                    throw new Error(`Invalid data format in CSV row ${index + 1}`);
                }
                const lon = parseFloat(row[0]);
                const lat = parseFloat(row[1]);
                const name = row[2] || `Location ${index + 1}`;
                if (isNaN(lon) || isNaN(lat)) {
                    throw new Error(`Invalid coordinates in CSV row ${index + 1}`);
                }
                return { lon, lat, name };
            });
        } else {
            // Validate required headers (lon, lat)
            const requiredHeaders = ['lon', 'lat'];
            const actualHeaders = Object.keys(locations[0] || {});
            for (const header of requiredHeaders) {
                if (!actualHeaders.includes(header)) {
                    // Attempt to find 'lng' if 'lon' is missing for backward compatibility or common variations
                    if (header === 'lon' && actualHeaders.includes('lng')) {
                        // If 'lng' is found, we'll use it but map to 'lon'
                        console.warn("CSV header 'lon' not found, using 'lng' instead.");
                    } else {
                        throw new Error(`Missing required header in CSV: '${header}'`);
                    }
                }
            }
            // Ensure coordinates are numbers
            locations = locations.map((row, index) => {
                // Prefer 'lon', but fall back to 'lng' if 'lon' is not present or not a number
                let lon = parseFloat(row.lon);
                if (isNaN(lon) && row.hasOwnProperty('lng')) {
                    lon = parseFloat(row.lng);
                }
                const lat = parseFloat(row.lat);

                if (isNaN(lon) || isNaN(lat)) {
                    throw new Error(`Invalid coordinates in CSV row ${index + 1} (expected 'lon' or 'lng', and 'lat' headers).`);
                }
                // Create a new object ensuring 'lon' is used, and remove 'lng' if it exists
                const newRow = { ...row, lon, lat };
                delete newRow.lng;
                return newRow;
            });
        }
    }

    console.log(`Parsed ${locations.length} locations from file`);
    return locations;
}

// Function to display location markers on the map with optimizations for large datasets
function displayLocationMarkers(locations) {
    // Don't proceed if no locations
    if (!locations || locations.length === 0) {
        console.log("No locations to display.");
        return;
    }

    // Create a standard layer group instead of marker cluster
    locationMarkersLayer = L.layerGroup().addTo(map);

    let bounds = L.latLngBounds();

    for (const loc of locations) {
        if (typeof loc.lat !== 'number' || typeof loc.lon !== 'number' || isNaN(loc.lat) || isNaN(loc.lon)) {
            console.warn("Skipping invalid location:", loc);
            continue;
        }
        const latLng = L.latLng(loc.lat, loc.lon); // L.latLng expects (lat, lng)
        const marker = L.circleMarker(latLng, {
            radius: 4,
            fillColor: '#3388ff',
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
            title: loc.name || `Lat: ${loc.lat.toFixed(4)}, Lon: ${loc.lon.toFixed(4)}` // Added title property
        }).bindPopup(loc.name || `Lat: ${loc.lat.toFixed(4)}, Lon: ${loc.lon.toFixed(4)}`);

        locationMarkersLayer.addLayer(marker);
        locationMarkers.push(marker); // Keep track if needed, though layer group handles removal
        bounds.extend(latLng);
    }

    // Optionally zoom/pan to fit markers if any were added
    if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.1)); // Add some padding
    }
}

// Function to clear all location markers
function clearLocationMarkers(resetInput = true) { // Parameter controls if file input value is cleared
    if (locationMarkersLayer) {
        map.removeLayer(locationMarkersLayer);
        locationMarkersLayer = null;
    }
    locationMarkers = [];

    // Reset the file input element value only if resetInput is true
    if (resetInput) {
        const fileInput = document.getElementById('location-file-input');
        if (fileInput) {
            fileInput.value = ''; // Clear the selected file
        }
        // No need to reset any span text content
    }
}

// Add event listener for file upload UI elements when the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    const locationControls = createLocationUploadControls();
    // Append controls directly to the map container
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
        mapContainer.appendChild(locationControls);
    } else {
        console.error("Map container not found. Cannot append location controls.");
        // Fallback or alternative placement if needed
        // document.body.appendChild(locationControls);
    }

    // Set up the event listener for file input
    document.getElementById('location-file-input').addEventListener('change', handleLocationFileUpload);
});

// Create UI controls for location upload
function createLocationUploadControls() {
    const controlPanel = document.createElement('div');
    controlPanel.id = 'location-upload-panel';
    controlPanel.style.position = 'absolute';
    controlPanel.style.top = 'auto';
    controlPanel.style.bottom = '25px';
    controlPanel.style.right = '10px';
    controlPanel.style.zIndex = '1000';
    controlPanel.style.padding = '10px';
    controlPanel.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; // Slightly transparent background
    controlPanel.style.border = '1px solid #ccc';
    controlPanel.style.borderRadius = '5px';
    controlPanel.style.boxShadow = '0 1px 5px rgba(0,0,0,0.4)'; // Add shadow for better visibility

    controlPanel.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">Upload Locations</div>
        <div style="margin-bottom: 8px; font-size: 0.9em;">(.csv: lon,lat,[name] or .ll: lon lat [name])</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="file" id="location-file-input" accept=".csv,.ll" style="padding: 5px;" />
            <div style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="file-has-headers" checked>
                <label for="file-has-headers" style="font-size: 0.9em;">.csv has headers</label>
            </div>
            <button id="clear-locations-btn" style="padding: 5px 10px;">Clear Locations</button>
        </div>
    `;

    // Add event listener for the clear button *after* creating the element
    controlPanel.querySelector('#clear-locations-btn').addEventListener('click', () => clearLocationMarkers(true));

    return controlPanel;
}
