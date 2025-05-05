// filepath: /home/arr65/src/nzcvm_webapp/js/locationUpload.js

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
    clearLocationMarkers(false); // Don't reset input yet

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
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            const name = parts[2] || `Location ${index + 1}`;
            if (isNaN(lng) || isNaN(lat)) {
                throw new Error(`Invalid coordinates in .ll file on line ${index + 1}`);
            }
            return { lng, lat, name };
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
            // Assume order is lng, lat, name if no headers
            locations = locations.map((row, index) => {
                if (!Array.isArray(row) || row.length < 2) {
                    throw new Error(`Invalid data format in CSV row ${index + 1}`);
                }
                const lng = parseFloat(row[0]);
                const lat = parseFloat(row[1]);
                const name = row[2] || `Location ${index + 1}`;
                if (isNaN(lng) || isNaN(lat)) {
                    throw new Error(`Invalid coordinates in CSV row ${index + 1}`);
                }
                return { lng, lat, name };
            });
        } else {
            // Validate required headers (lng, lat)
            const requiredHeaders = ['lng', 'lat'];
            const actualHeaders = Object.keys(locations[0] || {});
            for (const header of requiredHeaders) {
                if (!actualHeaders.includes(header)) {
                    throw new Error(`Missing required header in CSV: '${header}'`);
                }
            }
            // Ensure coordinates are numbers
            locations = locations.map((row, index) => {
                const lng = parseFloat(row.lng);
                const lat = parseFloat(row.lat);
                if (isNaN(lng) || isNaN(lat)) {
                    throw new Error(`Invalid coordinates in CSV row ${index + 1}`);
                }
                return { ...row, lng, lat }; // Keep other columns if present
            });
        }
    }

    console.log(`Parsed ${locations.length} locations from file`);
    return locations;
}

// Function to display location markers on the map with optimizations for large datasets
function displayLocationMarkers(locations) {
    // Don't proceed if no locations
    console.log(locations)
    if (!locations || locations.length === 0) {
        console.log("No locations to display.");
        return;
    }

    // Create a standard layer group instead of marker cluster
    locationMarkersLayer = L.layerGroup().addTo(map);

    let bounds = L.latLngBounds();

    for (const loc of locations) {
        if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number' || isNaN(loc.lat) || isNaN(loc.lng)) {
            console.warn("Skipping invalid location:", loc);
            continue;
        }
        const latLng = L.latLng(loc.lat, loc.lng);
        const marker = L.circleMarker(latLng, {
            radius: 5,
            fillColor: "#00f",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).bindPopup(loc.name || `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}`);

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
    // Append controls to a suitable container, e.g., map container or a dedicated sidebar
    const controlsContainer = document.getElementById('controls'); // Assuming you have a div with id='controls'
    if (controlsContainer) {
        controlsContainer.appendChild(locationControls);
    } else {
        // Fallback: append near the map if controls container doesn't exist
        document.getElementById('map-container').parentNode.insertBefore(locationControls, document.getElementById('map-container').nextSibling);
    }

    // Set up the event listener for file input
    document.getElementById('location-file-input').addEventListener('change', handleLocationFileUpload);
});

// Create UI controls for location upload
function createLocationUploadControls() {
    const controlPanel = document.createElement('div');
    controlPanel.id = 'location-upload-panel';
    controlPanel.style.padding = '10px';
    controlPanel.style.backgroundColor = '#f9f9f9';
    controlPanel.style.border = '1px solid #ccc';
    controlPanel.style.borderRadius = '5px';
    controlPanel.style.marginTop = '10px';

    controlPanel.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">Upload and display locations</div>
        <div style="margin-bottom: 8px; font-size: 0.9em;">Accepted formats: .csv (lng,lat,[name]) or .ll (lng lat [name])</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <!-- Standard file input -->
            <input type="file" id="location-file-input" accept=".csv,.ll" style="padding: 5px;" />
            <div style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="file-has-headers" checked>
                <label for="file-has-headers" style="font-size: 0.9em;">.csv file has headers (lng, lat, name)</label>
            </div>
            <button id="clear-locations-btn" style="padding: 5px 10px;">Clear Displayed Locations</button>
        </div>
    `;

    // Add event listener for the clear button *after* creating the element
    controlPanel.querySelector('#clear-locations-btn').addEventListener('click', () => clearLocationMarkers(true));

    return controlPanel;
}
