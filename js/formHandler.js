// Functions to handle the input form

// Function to update the displayed grid point calculations
function updateGridPointDisplay() {
    const extentX = parseFloat(document.getElementById('extent-x').value);
    const extentY = parseFloat(document.getElementById('extent-y').value);
    const extentLatlonSpacing = parseFloat(document.getElementById('xy-spacing').value);
    const extentZmax = parseFloat(document.getElementById('extent-zmax').value);
    const extentZmin = parseFloat(document.getElementById('extent-zmin').value);
    const extentZSpacing = parseFloat(document.getElementById('z-spacing').value);

    const gridData = calculateGridPoints(extentX, extentY, extentLatlonSpacing, extentZmax, extentZmin, extentZSpacing);
    const approxRunTimeMin = calculateApproxRunTime(gridData.totalGridPoints) / 60.0;

    // Use Number.toLocaleString() for better readability of large numbers
    const formatNumber = (num) => isNaN(num) ? '---' : num.toLocaleString();
    // Format runtime to 1 decimal place
    const formatTime = (time) => isNaN(time) ? '---' : time.toFixed(1);

    document.querySelector('#grid-nx-display span').textContent = formatNumber(gridData.nx);
    document.querySelector('#grid-ny-display span').textContent = formatNumber(gridData.ny);
    document.querySelector('#grid-nz-display span').textContent = formatNumber(gridData.nz);
    document.querySelector('#grid-total-display span').textContent = formatNumber(gridData.totalGridPoints);
    document.querySelector('#grid-runtime-display span').textContent = formatTime(approxRunTimeMin);
}


// Function to update form with current rectangle bounds (called during/after map interaction)
function updateFormValues() {
    if (!rectangle) return; // Ensure rectangle exists

    const bounds = rectangle.getBounds();
    const center = bounds.getCenter(); // Use center as origin
    const originLat = center.lat;
    const originLon = center.lng; // center.lng is from Leaflet

    // Calculate width and height in KM using map.distance
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const northWest = bounds.getNorthWest(); // Use NW for height calculation start

    // Calculate width (distance between SW and SE or NW and NE along latitude)
    const widthMeters = map.distance(southWest, L.latLng(southWest.lat, northEast.lng));
    // Calculate height (distance between NW and SW or NE and SE along longitude)
    const heightMeters = map.distance(northWest, southWest);

    const widthKm = widthMeters / 1000;
    const heightKm = heightMeters / 1000;

    // Update form fields for origin
    document.getElementById('origin-lat').value = originLat.toFixed(6);
    document.getElementById('origin-lon').value = originLon.toFixed(6);

    // Update form fields for extents
    document.getElementById('extent-x').value = widthKm.toFixed(3);
    document.getElementById('extent-y').value = heightKm.toFixed(3);

    // Update rotation field based on the current angle from map interaction
    document.getElementById('rotation').value = rotationAngle.toFixed(1);

    // Update grid point display
    updateGridPointDisplay();
}

// Function to update the rectangle based on form values
function updateRectangleFromForm() {
    // Add check to ensure rectangle and its path are initialized
    if (!rectangle || !rectangle._path) {
        console.warn("Rectangle not fully initialized yet. Skipping form update.");
        return;
    }

    const originLat = parseFloat(document.getElementById('origin-lat').value);
    const originLon = parseFloat(document.getElementById('origin-lon').value);
    const extentX = parseFloat(document.getElementById('extent-x').value);
    const extentY = parseFloat(document.getElementById('extent-y').value);
    // Read the raw value from the input for rotation
    const newRotationRaw = document.getElementById('rotation').value;
    const newRotation = parseFloat(newRotationRaw); // Parse it

    // Check if parsing was successful and other values are valid
    if (!isNaN(originLat) && !isNaN(originLon) && !isNaN(extentX) && !isNaN(extentY) && extentX > 0 && extentY > 0 && !isNaN(newRotation)) {
        // Calculate new bounds based on form inputs
        const newBounds = calculateBoundsFromOriginAndExtents(originLat, originLon, extentX, extentY);
        rectangle.setBounds(newBounds);

        // Apply rotation, ensuring it's within [0, 360)
        rotationAngle = ((newRotation % 360) + 360) % 360;
        applyRotation(); // This also updates handles

        // Update grid point display as extents might have changed
        updateGridPointDisplay();
    } else {
        // Invalid input warning
        console.warn("Invalid input detected in form. Rectangle not updated.");
    }
}

// Initialize form values on load directly from defaults
document.addEventListener('DOMContentLoaded', function () {
    // Set form fields to initial default values
    // Use values from mapSetup.js for consistency
    document.getElementById('origin-lat').value = initialOriginLat.toFixed(6);
    document.getElementById('origin-lon').value = initialOriginLon.toFixed(6);
    document.getElementById('extent-x').value = initialExtentX.toFixed(3);
    document.getElementById('extent-y').value = initialExtentY.toFixed(3);
    // Rotation defaults to 0 if not specified otherwise
    document.getElementById('rotation').value = (rotationAngle || 0).toFixed(1);
    // Other fields retain their HTML defaults (e.g., xy-spacing, z-values, min-vs)

    // Initial calculation and display of grid points based on defaults
    updateGridPointDisplay();
});

// Add event listeners to relevant input fields to update grid points on change
const gridPointInputs = [
    'extent-x', 'extent-y', 'xy-spacing',
    'extent-zmax', 'extent-zmin', 'z-spacing'
];
gridPointInputs.forEach(id => {
    const inputElement = document.getElementById(id);
    if (inputElement) {
        // These inputs only affect the grid calculation display directly
        inputElement.addEventListener('input', updateGridPointDisplay);
    }
});

// Add event listeners to form fields that control rectangle geometry/rotation
const rectangleControlInputs = [
    'origin-lat', 'origin-lon', 'extent-x', 'extent-y', 'rotation'
];
rectangleControlInputs.forEach(id => {
    const inputElement = document.getElementById(id);
    if (inputElement) {
        inputElement.addEventListener('input', updateRectangleFromForm);
    }
});
