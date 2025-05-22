// Handles rectangle creation and manipulation on the map

// Create a rectangle using initial bounds calculated from mapSetup parameters
const initialBounds = calculateBoundsFromOriginAndExtents(
    initialOriginLat,
    initialOriginLon,
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
    // Check for rectangle existence
    if (!rectangle) return;

    const center = rectangle.getBounds().getCenter();
    rectangleCenter = center;

    // Get the current pixel position of the center
    const centerPoint = map.latLngToLayerPoint(center);

    // Check for rectangle._path before applying styles
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
        lastPos = e.latlng;
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


// Handle mouse movement
document.addEventListener('mousemove', function (e) {
    if (!isDragging && !isResizing && !isRotating) return;

    // Convert screen position to map coordinates
    const containerPoint = new L.Point(e.clientX, e.clientY);
    const layerPoint = map.containerPointToLayerPoint(containerPoint);
    const currentLatLng = map.layerPointToLatLng(layerPoint); // Renamed to avoid conflict with calculateAngle's new signature

    if (isRotating && rectangleCenter && lastPos) { // lastPos is a Leaflet LatLng
        // Calculate rotation angle (note the negative sign)
        // Adapt the call to calculateAngle, as it now expects {lat, lon} objects
        const angleDelta = -calculateAngle(
            { lat: rectangleCenter.lat, lon: rectangleCenter.lng },
            { lat: lastPos.lat, lon: lastPos.lng },
            { lat: currentLatLng.lat, lon: currentLatLng.lng }
        );
        // Ensure rotationAngle stays within [0, 360)
        rotationAngle = (((rotationAngle + angleDelta) % 360) + 360) % 360;

        // Apply the rotation
        applyRotation();
    } else if (isDragging) {
        // Calculate the movement delta
        const latDiff = currentLatLng.lat - lastPos.lat;
        const lonDiff = currentLatLng.lng - lastPos.lng; // lastPos is Leaflet LatLng
        const currentBounds = rectangle.getBounds();
        const sw = currentBounds.getSouthWest();
        const ne = currentBounds.getNorthEast();

        // Update rectangle position
        rectangle.setBounds([
            [sw.lat + latDiff, sw.lng + lonDiff], // sw.lng is Leaflet LatLng
            [ne.lat + latDiff, ne.lng + lonDiff], // ne.lng is Leaflet LatLng
        ]);

        // Reapply rotation after moving
        applyRotation();

        // Update form values
        updateFormValues();
    } else if (isResizing && rectangleCenter && initialResizeHandlePos && initialRectBounds) {
        // Get current mouse position and initial handle position in screen coordinates
        const currentMousePoint = map.latLngToContainerPoint(currentLatLng);
        const initialMousePoint = map.latLngToContainerPoint(initialResizeHandlePos); // initialResizeHandlePos is Leaflet LatLng
        const centerPoint = map.latLngToContainerPoint(rectangleCenter); // rectangleCenter is Leaflet LatLng

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
        const center = initialRectBounds.getCenter(); // Leaflet LatLng
        const width = Math.abs(origNE.lng - origSW.lng) * scaleX; // .lng from Leaflet LatLng
        const height = Math.abs(origNE.lat - origSW.lat) * scaleY;
        const halfWidthLon = width / 2;
        const halfHeightLat = height / 2;

        const newBounds = L.latLngBounds(
            L.latLng(center.lat - halfHeightLat, center.lng - halfWidthLon), // center.lng from Leaflet
            L.latLng(center.lat + halfHeightLat, center.lng + halfWidthLon)  // center.lng from Leaflet
        );
        rectangle.setBounds(newBounds);

        // Update the resize handle position
        if (resizeHandle) {
            resizeHandle.setLatLng(currentLatLng);
        }

        // Reapply rotation
        applyRotation();

        // Update form values
        updateFormValues();
    }

    // Update last position
    lastPos = currentLatLng;
});

// End interaction on mouseup
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

// Reset cursor when mouse leaves the rectangle
rectangle.on('mouseout', function () {
    rectangle._path.style.cursor = '';
});

// Initialize rotation and resize handles when layer is added
map.on('layeradd', function (e) {
    if (e.layer === rectangle) {
        setTimeout(function () {
            applyRotation();
            createRotationHandle();
            createResizeHandle();
        }, 100);
    }
});

// Update handles when map changes
map.on('zoomend moveend dragend zoom move viewreset', function () {
    if (rectangle) {
        // Ensure rectangle rotation is properly maintained after any map change
        applyRotation();
    }
});

// Add event handler for when the map is redrawn
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
    }
}, 500); // Use a delay to allow Leaflet to render first
