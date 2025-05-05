// filepath: /home/arr65/src/nzcvm_webapp/js/rectangleControls.js

// Create a rectangle using initial bounds calculated from mapSetup parameters
const initialBounds = calculateBoundsFromOriginAndExtents(
    initialOriginLat,
    initialOriginLng,
    initialExtentX,
    initialExtentY
);

const rectangle = L.rectangle(initialBounds, {
    color: "#ff7800",
    weight: 2,
    fillOpacity: 0.2
}).addTo(map);

// Variables for rotation handle
let rotationHandle = null;
let rotationLine = null;
let rotationHandleDistance = 50; // pixels

// Variables for resize handle
let resizeHandle = null;
let resizeLine = null;

// Variables for resize operations
let initialResizeHandlePos = null;
let initialRectBounds = null;

// Variables to track interaction state
let isDragging = false;
let isResizing = false;
let isRotating = false;
let lastPos = null;
let rotationAngle = 0;
let rectangleCenter = null;

// Create rotation handle icon
const rotationIcon = L.divIcon({
    className: 'rotation-handle-icon',
    html: '<div class="rotation-icon"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// Create resize handle icon
const resizeIcon = L.divIcon({
    className: 'resize-handle-icon',
    html: '<div class="resize-icon"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// Function to create and position the rotation handle
function createRotationHandle() {
    if (rotationHandle) {
        map.removeLayer(rotationHandle);
    }

    if (rotationLine) {
        map.removeLayer(rotationLine);
    }

    // Get the center and bounds of the rectangle
    const bounds = rectangle.getBounds();
    const center = bounds.getCenter();
    rectangleCenter = center;

    // Apply rotation to handle and line (only need to call this once)
    updateRotationHandlePosition();
}

// Function to update rotation handle position when rectangle is moved or rotated
function updateRotationHandlePosition() {
    if (!rectangle) return;

    // Remove existing handle and line if they exist
    if (rotationHandle) {
        map.removeLayer(rotationHandle);
    }

    if (rotationLine) {
        map.removeLayer(rotationLine);
    }

    const bounds = rectangle.getBounds();
    const center = bounds.getCenter();

    // Calculate the top center point of the rectangle (before rotation)
    const topCenter = L.latLng(bounds.getNorth(), center.lng);

    // Calculate the position with rotation applied
    const centerPoint = map.latLngToLayerPoint(center);
    const topCenterPoint = map.latLngToLayerPoint(topCenter);

    // Calculate vector from center to top center
    const vecX = topCenterPoint.x - centerPoint.x;
    const vecY = topCenterPoint.y - centerPoint.y;

    // Apply rotation to this vector
    const angle = rotationAngle * (Math.PI / 180);
    const rotatedVecX = vecX * Math.cos(angle) - vecY * Math.sin(angle);
    const rotatedVecY = vecX * Math.sin(angle) + vecY * Math.cos(angle);

    // Calculate the rotated top center point
    const rotatedTopCenterX = centerPoint.x + rotatedVecX;
    const rotatedTopCenterY = centerPoint.y + rotatedVecY;
    const rotatedTopCenterPoint = L.point(rotatedTopCenterX, rotatedTopCenterY);

    // Calculate the handle position at a fixed distance from the rotated top center
    const handleX = rotatedTopCenterX + rotationHandleDistance * Math.sin(angle);
    const handleY = rotatedTopCenterY - rotationHandleDistance * Math.cos(angle);
    const handlePoint = L.point(handleX, handleY);

    const rotatedTopCenter = map.layerPointToLatLng(rotatedTopCenterPoint);
    const handleLatLng = map.layerPointToLatLng(handlePoint);

    // Create the rotation handle
    rotationHandle = L.marker(handleLatLng, {
        icon: rotationIcon,
        draggable: false,
        zIndexOffset: 1000
    }).addTo(map);

    // Add click handler to rotation handle
    rotationHandle.on('mousedown', function (e) {
        isRotating = true;
        lastPos = e.latlng;
        map.dragging.disable(); // Disable map dragging while rotating

        // Prevent event propagation
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
    });

    // Create connecting line from top center of rectangle to handle
    rotationLine = L.polyline([rotatedTopCenter, handleLatLng], {
        color: '#ff7800',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '5, 5'
    }).addTo(map);
}

// Function to apply rotation to rectangle
function applyRotation() {
    const center = rectangle.getBounds().getCenter();
    rectangleCenter = center;

    // Get the current pixel position of the center
    const centerPoint = map.latLngToLayerPoint(center);

    // Apply rotation transformation using CSS with absolute coordinates
    // This ensures rotation works correctly at any zoom level
    if (rectangle._path) { // Check if path exists
        rectangle._path.style.transformOrigin = `${centerPoint.x}px ${centerPoint.y}px`;
        rectangle._path.style.transform = `rotate(${rotationAngle}deg)`;
    }

    // Update form with new rotation value
    document.getElementById('rotation').value = rotationAngle.toFixed(1);

    // Update rotation handle position
    updateRotationHandlePosition();

    // Update resize handle position
    updateResizeHandlePosition();
}

// Function to create and position the resize handle
function createResizeHandle() {
    if (resizeHandle) {
        map.removeLayer(resizeHandle);
    }

    if (resizeLine) {
        map.removeLayer(resizeLine);
    }

    updateResizeHandlePosition();
}

// Function to update resize handle position when rectangle is moved or rotated
function updateResizeHandlePosition() {
    if (!rectangle) return;

    // Remove existing handle and line if they exist
    if (resizeHandle) {
        map.removeLayer(resizeHandle);
    }

    if (resizeLine) {
        map.removeLayer(resizeLine);
    }

    const bounds = rectangle.getBounds();
    const center = bounds.getCenter();

    // Calculate the top-right corner of the rectangle (before rotation)
    const topRight = L.latLng(bounds.getNorth(), bounds.getEast());

    // Apply rotation to this corner
    const centerPoint = map.latLngToLayerPoint(center);
    const cornerPoint = map.latLngToLayerPoint(topRight);

    // Calculate vector from center to corner
    const vecX = cornerPoint.x - centerPoint.x;
    const vecY = cornerPoint.y - centerPoint.y;

    // Apply rotation to this vector
    const angle = rotationAngle * (Math.PI / 180);
    const rotatedVecX = vecX * Math.cos(angle) - vecY * Math.sin(angle);
    const rotatedVecY = vecX * Math.sin(angle) + vecY * Math.cos(angle);

    // Calculate the rotated corner point
    const rotatedCornerX = centerPoint.x + rotatedVecX;
    const rotatedCornerY = centerPoint.y + rotatedVecY;
    const rotatedCornerPoint = L.point(rotatedCornerX, rotatedCornerY);
    const rotatedCorner = map.layerPointToLatLng(rotatedCornerPoint);

    // Create the resize handle
    resizeHandle = L.marker(rotatedCorner, {
        icon: resizeIcon,
        draggable: false,
        zIndexOffset: 1000
    }).addTo(map);

    // Add mousedown handler to resize handle
    resizeHandle.on('mousedown', function (e) {
        isResizing = true;
        initialResizeHandlePos = e.latlng;
        initialRectBounds = rectangle.getBounds();
        rectangleCenter = initialRectBounds.getCenter();
        map.dragging.disable();
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
    });
}

// Make rectangle interactive
rectangle.on('mousedown', function (e) {
    const bounds = rectangle.getBounds();

    // Store rectangle center for calculations
    rectangleCenter = bounds.getCenter();
    isDragging = true;
    lastPos = e.latlng;
    map.dragging.disable();
    // Prevent event propagation
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
});

// Handle mouse movement
document.addEventListener('mousemove', function (e) {
    if (!(isDragging || isResizing || isRotating)) return;

    // Convert screen position to map coordinates
    const containerPoint = new L.Point(e.clientX, e.clientY);
    const layerPoint = map.containerPointToLayerPoint(containerPoint);
    const latlng = map.layerPointToLatLng(layerPoint);

    if (isDragging && lastPos) {
        const offsetLat = latlng.lat - lastPos.lat;
        const offsetLng = latlng.lng - lastPos.lng;
        const newBounds = rectangle.getBounds().map(coord => [coord[0] + offsetLat, coord[1] + offsetLng]);
        rectangle.setBounds(newBounds);
        applyRotation(); // Re-apply rotation and update handles
        updateFormValues(); // Update form origin
    } else if (isResizing && resizeHandle && rectangleCenter) {
        // Calculate vector from center to current mouse position
        const centerPoint = map.latLngToLayerPoint(rectangleCenter);
        const currentPoint = map.latLngToLayerPoint(latlng);
        const currentVecX = currentPoint.x - centerPoint.x;
        const currentVecY = currentPoint.y - centerPoint.y;

        // Rotate this vector back by -rotationAngle to align with axes
        const angle = -rotationAngle * (Math.PI / 180);
        const projectedX = currentVecX * Math.cos(angle) - currentVecY * Math.sin(angle);
        const projectedY = currentVecX * Math.sin(angle) + currentVecY * Math.cos(angle);

        // Calculate new dimensions based on projected distances (these are half-extents in pixels)
        const newWidthKm = Math.abs(projectedX) * 2 / 1000 * Math.pow(2, 18 - map.getZoom()); // Rough pixel to km conversion (needs refinement)
        const newHeightKm = Math.abs(projectedY) * 2 / 1000 * Math.pow(2, 18 - map.getZoom()); // Rough pixel to km conversion (needs refinement)

        // Update rectangle bounds based on new dimensions and center
        const newBounds = calculateBoundsFromOriginAndExtents(rectangleCenter.lat, rectangleCenter.lng, newWidthKm, newHeightKm);
        rectangle.setBounds(newBounds);

        // Calculate new extents in KM from the new bounds
        const newSW = newBounds.getSouthWest();
        const newNE = newBounds.getNorthEast();
        const centerLat = newBounds.getCenter().lat;
        const latDiff = Math.abs(newNE.lat - newSW.lat);
        const lngDiff = Math.abs(newNE.lng - newSW.lng);
        const kmDimensions = degreesToKm(latDiff, lngDiff, centerLat);

        // Update extent form fields
        document.getElementById('extent-x').value = kmDimensions.lngKm.toFixed(3);
        document.getElementById('extent-y').value = kmDimensions.latKm.toFixed(3);

        // Reapply rotation
        applyRotation();

        // Update form values (including grid points)
        updateFormValues();
    } else if (isRotating && rectangleCenter) {
        const angleDegrees = calculateAngle(rectangleCenter, lastPos, latlng);
        rotationAngle = (rotationAngle + angleDegrees) % 360;
        applyRotation();
    }

    // Update last position
    lastPos = latlng;
});

// End interaction on mouseup
document.addEventListener('mouseup', function () {
    if (isDragging || isResizing || isRotating) {
        isDragging = false;
        isResizing = false;
        isRotating = false;
        lastPos = null;
        map.dragging.enable();
        // Final update of form values after interaction ends
        updateFormValues();
    }
});

// Reset cursor when mouse leaves the rectangle
rectangle.on('mouseout', function () {
    // Optional: Reset cursor if needed, though mouseup handles state reset
});

// Initialize rotation and resize handles when layer is added
map.on('layeradd', function (e) {
    if (e.layer === rectangle) {
        createRotationHandle();
        createResizeHandle();
    }
});

// Update handles when map changes
map.on('zoomend moveend dragend zoom move viewreset', function () {
    if (rectangle && map.hasLayer(rectangle)) {
        applyRotation(); // Re-applies rotation and updates handles
    }
});

// Add event handler for when the map is redrawn (might be needed for some Leaflet versions)
map.on('redraw', function () {
    if (rectangle && map.hasLayer(rectangle)) {
        applyRotation();
    }
});

// Initialize rotation and resize handles after a short delay to ensure map is ready
setTimeout(function () {
    if (rectangle && map.hasLayer(rectangle)) {
        createRotationHandle();
        createResizeHandle();
        applyRotation(); // Apply initial rotation if any
    }
}, 500);
