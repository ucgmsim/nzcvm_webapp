// filepath: /home/arr65/src/nzcvm_webapp/js/formHandler.js

// Function to update the displayed grid point calculations
function updateGridPointDisplay() {
    const extentX = parseFloat(document.getElementById('extent-x').value);
    const extentY = parseFloat(document.getElementById('extent-y').value);
    const extentLatlonSpacing = parseFloat(document.getElementById('xy-spacing').value);
    const extentZmax = parseFloat(document.getElementById('extent-zmax').value);
    const extentZmin = parseFloat(document.getElementById('extent-zmin').value);
    const extentZSpacing = parseFloat(document.getElementById('z-spacing').value);

    const gridData = calculateGridPoints(extentX, extentY, extentLatlonSpacing, extentZmax, extentZmin, extentZSpacing);

    // Use Number.toLocaleString() for better readability of large numbers
    const formatNumber = (num) => isNaN(num) ? '---' : num.toLocaleString();

    document.querySelector('#grid-nx-display span').textContent = formatNumber(gridData.nx);
    document.querySelector('#grid-ny-display span').textContent = formatNumber(gridData.ny);
    document.querySelector('#grid-nz-display span').textContent = formatNumber(gridData.nz);
    document.querySelector('#grid-total-display span').textContent = formatNumber(gridData.totalGridPoints);
}


// Function to update form with current rectangle bounds
function updateFormValues() {
    if (!rectangle) return; // Ensure rectangle exists

    const bounds = rectangle.getBounds();
    const center = bounds.getCenter(); // Use center as origin for simplicity here
    const originLat = center.lat;
    const originLng = center.lng;

    // Calculate width and height in KM using map.distance for accuracy
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
    document.getElementById('origin-lng').value = originLng.toFixed(6);

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
    const originLat = parseFloat(document.getElementById('origin-lat').value);
    const originLng = parseFloat(document.getElementById('origin-lng').value);
    const extentX = parseFloat(document.getElementById('extent-x').value);
    const extentY = parseFloat(document.getElementById('extent-y').value);
    // Read the raw value from the input for rotation
    const newRotationRaw = document.getElementById('rotation').value;
    const newRotation = parseFloat(newRotationRaw); // Parse it

    // Check if parsing was successful and other values are valid
    if (!isNaN(originLat) && !isNaN(originLng) && !isNaN(extentX) && !isNaN(extentY) && extentX > 0 && extentY > 0 && !isNaN(newRotation)) {
        // Calculate new bounds based on form inputs
        const newBounds = calculateBoundsFromOriginAndExtents(originLat, originLng, extentX, extentY);
        rectangle.setBounds(newBounds);

        // Apply rotation
        rotationAngle = newRotation;
        applyRotation(); // This also updates handles

        // Update grid point display as extents might have changed
        updateGridPointDisplay();
    } else {
        // Handle invalid input if necessary, e.g., show a message or revert
        console.warn("Invalid input detected in form. Rectangle not updated.");
        // Optionally, if rotation parsing failed but others are okay, maybe just update bounds?
        // Or provide feedback to the user about the invalid rotation input.
    }
}

// Initialize form values on load
document.addEventListener('DOMContentLoaded', function () {
    // Initial calculation and display of grid points
    updateGridPointDisplay();
    // Initial update of form origin based on rectangle
    // The timeout in rectangleControls.js handles initial applyRotation which calls updateFormValues
});

// Remove form submission handler for the now-deleted Apply button
// document.getElementById('apply-btn').addEventListener('click', function () { ... });

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
    'origin-lat', 'origin-lng', 'extent-x', 'extent-y', 'rotation'
];
rectangleControlInputs.forEach(id => {
    const inputElement = document.getElementById(id);
    if (inputElement) {
        inputElement.addEventListener('input', updateRectangleFromForm);
    }
});
