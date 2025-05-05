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
    // Add check for rectangle existence
    if (!rectangle) return;

    const center = rectangle.getBounds().getCenter();
    rectangleCenter = center;

    // Get the current pixel position of the center
    const centerPoint = map.latLngToLayerPoint(center);

    // Add check for rectangle._path before applying styles
    if (rectangle._path) {
        // Apply rotation transformation using CSS with absolute coordinates
        // This ensures rotation works correctly at any zoom level
        rectangle._path.style.transformOrigin = `${centerPoint.x}px ${centerPoint.y}px`;
        rectangle._path.style.transform = `rotate(${rotationAngle}deg)`;
    } else {
        console.warn("Rectangle path not found during applyRotation.");
    }


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
        lastPos = e.latlng; // Added this line to match old_js.js
        map.dragging.disable(); // Disable map dragging while resizing

        // Store initial handle position and rectangle bounds
        initialResizeHandlePos = e.latlng;
        initialRectBounds = rectangle.getBounds();
        rectangleCenter = initialRectBounds.getCenter();

        // Prevent event propagation
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

// Calculate angle between three points (Added from old_js.js)
function calculateAngle(center, p1, p2) {
    const angle1 = Math.atan2(p1.lat - center.lat, p1.lng - center.lng);
    const angle2 = Math.atan2(p2.lat - center.lat, p2.lng - center.lng);
    return ((angle2 - angle1) * 180 / Math.PI);
}


// Handle mouse movement (Reverted to old_js.js version)
document.addEventListener('mousemove', function (e) {
    if (!isDragging && !isResizing && !isRotating) return;

    // Convert screen position to map coordinates
    const containerPoint = new L.Point(e.clientX, e.clientY);
    const layerPoint = map.containerPointToLayerPoint(containerPoint);
    const latlng = map.layerPointToLatLng(layerPoint);

    if (isRotating && rectangleCenter) {
        // Calculate rotation angle and reverse the direction
        const angleDelta = -calculateAngle(rectangleCenter, lastPos, latlng);
        // Ensure rotationAngle stays within [0, 360)
        rotationAngle = (((rotationAngle + angleDelta) % 360) + 360) % 360;

        // Apply the rotation
        applyRotation();
    } else if (isDragging) {
        // Calculate the movement delta
        const latDiff = latlng.lat - lastPos.lat;
        const lngDiff = latlng.lng - lastPos.lng;
        const currentBounds = rectangle.getBounds();
        const sw = currentBounds.getSouthWest();
        const ne = currentBounds.getNorthEast();

        // Update rectangle position
        rectangle.setBounds([
            [sw.lat + latDiff, sw.lng + lngDiff],
            [ne.lat + latDiff, ne.lng + lngDiff],
        ]);

        // Reapply rotation after moving
        applyRotation();

        // Update form values
        updateFormValues();
    } else if (isResizing && rectangleCenter && initialResizeHandlePos && initialRectBounds) {
        // Get current mouse position and initial handle position in screen coordinates
        const currentMousePoint = map.latLngToContainerPoint(latlng);
        const initialMousePoint = map.latLngToContainerPoint(initialResizeHandlePos);
        const centerPoint = map.latLngToContainerPoint(rectangleCenter);

        // Calculate rotation vectors once (optimization)
        const angle = rotationAngle * Math.PI / 180;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        // Calculate mouse movement vector
        const dx = currentMousePoint.x - initialMousePoint.x;
        const dy = currentMousePoint.y - initialMousePoint.y;

        // Project mouse movement onto the rotated axes of the rectangle
        const projectionOnWidth = dx * cosAngle + dy * sinAngle;
        const projectionOnHeight = -(dx * -sinAngle + dy * cosAngle);

        // Get initial rectangle dimensions
        const origSW = initialRectBounds.getSouthWest();
        const origNE = initialRectBounds.getNorthEast();
        const origSWPoint = map.latLngToContainerPoint(origSW);
        const origNEPoint = map.latLngToContainerPoint(origNE);
        const initialWidth = origNEPoint.x - origSWPoint.x;
        const initialHeight = origSWPoint.y - origNEPoint.y;

        // Calculate scale factors with minimum scale limit
        const minScale = 0.05;
        let scaleX = Math.max((initialWidth + projectionOnWidth) / initialWidth || 1, minScale);
        let scaleY = Math.max((initialHeight + projectionOnHeight) / initialHeight || 1, minScale);

        // Calculate new bounds
        const center = initialRectBounds.getCenter();
        const width = Math.abs(origNE.lng - origSW.lng) * scaleX;
        const height = Math.abs(origNE.lat - origSW.lat) * scaleY;
        const halfWidthLng = width / 2;
        const halfHeightLat = height / 2;

        const newBounds = L.latLngBounds(
            L.latLng(center.lat - halfHeightLat, center.lng - halfWidthLng),
            L.latLng(center.lat + halfHeightLat, center.lng + halfWidthLng)
        );
        rectangle.setBounds(newBounds);

        // Update the resize handle position
        if (resizeHandle) {
            resizeHandle.setLatLng(latlng);
        }

        // Reapply rotation
        applyRotation();

        // Update form values
        updateFormValues();
    }

    // Update last position
    lastPos = latlng;
});

// End interaction on mouseup (Reverted to old_js.js version)
document.addEventListener('mouseup', function () {
    if (!(isDragging || isResizing || isRotating)) return;

    // End interaction
    isDragging = false;
    isResizing = false;
    isRotating = false;
    lastPos = null;

    // Re-enable map dragging
    map.dragging.enable();

    // Update form values when interaction ends
    updateFormValues();
});

// Reset cursor when mouse leaves the rectangle (Reverted to old_js.js version)
rectangle.on('mouseout', function () {
    rectangle._path.style.cursor = '';
});

// Initialize rotation and resize handles when layer is added (Reverted to old_js.js version)
map.on('layeradd', function (e) {
    if (e.layer === rectangle) {
        setTimeout(function () {
            applyRotation();
            createRotationHandle();
            createResizeHandle();
        }, 100);
    }
});

// Update handles when map changes (Reverted to old_js.js version)
map.on('zoomend moveend dragend zoom move viewreset', function () {
    if (rectangle) {
        // Ensure rectangle rotation is properly maintained after any map change
        applyRotation();
    }
});

// Add event handler for when the map is redrawn (Reverted to old_js.js version)
map.on('redraw', function () {
    setTimeout(function () {
        if (rectangle) {
            applyRotation();
        }
    }, 50);
});

// Initialize rotation and resize handles after a short delay
setTimeout(function () {
    if (rectangle && map.hasLayer(rectangle)) { // Add check back for safety
        applyRotation(); // Apply initial rotation/styles and create handles
        // Remove form update call - form is now initialized on DOMContentLoaded
        // updateFormValues();
    }
}, 500); // Keep delay to allow Leaflet to potentially render first
