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

    // Update form fields for origin
    document.getElementById('origin-lat').value = originLat.toFixed(6);
    document.getElementById('origin-lng').value = originLng.toFixed(6);
    // Keep extent-x, extent-y, rotation as they are (driven by user input or map interaction)

    // Update grid point display
    updateGridPointDisplay();
}

// Initialize form values on load
document.addEventListener('DOMContentLoaded', function () {
    // Initial calculation and display of grid points
    updateGridPointDisplay();
    // Initial update of form origin based on rectangle
    updateFormValues();
});

// Handle form submission (Apply changes button) to update rectangle
document.getElementById('apply-btn').addEventListener('click', function () {
    const originLat = parseFloat(document.getElementById('origin-lat').value);
    const originLng = parseFloat(document.getElementById('origin-lng').value);
    const extentX = parseFloat(document.getElementById('extent-x').value);
    const extentY = parseFloat(document.getElementById('extent-y').value);
    const newRotation = parseFloat(document.getElementById('rotation').value);

    if (!isNaN(originLat) && !isNaN(originLng) && !isNaN(extentX) && !isNaN(extentY) && extentX > 0 && extentY > 0 && !isNaN(newRotation)) {
        // Calculate new bounds based on form inputs
        const newBounds = calculateBoundsFromOriginAndExtents(originLat, originLng, extentX, extentY);
        rectangle.setBounds(newBounds);

        // Apply rotation
        rotationAngle = newRotation;
        applyRotation(); // This also updates handles

        // Update form values after applying changes
        updateFormValues(); // This calls updateGridPointDisplay
    }
});

// Add event listeners to relevant input fields to update grid points on change
const gridPointInputs = [
    'extent-x', 'extent-y', 'xy-spacing',
    'extent-zmax', 'extent-zmin', 'z-spacing'
];
gridPointInputs.forEach(id => {
    const inputElement = document.getElementById(id);
    if (inputElement) {
        inputElement.addEventListener('input', updateGridPointDisplay);
    }
});
