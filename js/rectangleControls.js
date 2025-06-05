// Handles rectangle creation and manipulation on the map

// Create a rotatable rectangle class that extends L.Polygon
const RotatableRectangle = L.Polygon.extend({
    initialize: function (bounds, options) {
        this._originalBounds = L.latLngBounds(bounds);
        this._rotationAngle = 0;
        const corners = this._calculateCorners(this._originalBounds, 0);
        L.Polygon.prototype.initialize.call(this, corners, options);
    },

    // Add rectangle-like methods for compatibility
    getBounds: function () {
        return this._originalBounds;
    },

    setBounds: function (bounds) {
        this._originalBounds = L.latLngBounds(bounds);
        this._updateCorners();
        return this;
    },

    setRotation: function (angle) {
        this._rotationAngle = ((angle % 360) + 360) % 360; // Normalize to [0, 360)
        window.rotationAngle = this._rotationAngle; // Keep global in sync
        this._updateCorners();
        return this;
    },

    getRotation: function () {
        return this._rotationAngle;
    },

    _calculateCorners: function (bounds, angle) {
        const center = bounds.getCenter();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        // Convert degree extents to kilometers for proper rotation
        const degreeExtents = degreesToKm(
            ne.lat - sw.lat,  // height in degrees
            ne.lng - sw.lng,  // width in degrees  
            center.lat        // reference latitude for conversion
        );

        const halfWidthKm = degreeExtents.lonKm / 2;
        const halfHeightKm = degreeExtents.latKm / 2;

        // Convert rotation angle to radians (negative for clockwise rotation)
        const angleRad = -angle * (Math.PI / 180);

        // Define the four corners relative to center in kilometers
        const relativeCorners = [
            [-halfWidthKm, -halfHeightKm], // SW
            [halfWidthKm, -halfHeightKm],  // SE
            [halfWidthKm, halfHeightKm],   // NE
            [-halfWidthKm, halfHeightKm]   // NW
        ];

        // Rotate each corner around the center in km space
        const corners = [];
        relativeCorners.forEach(([dxKm, dyKm]) => {
            // Apply rotation matrix in km space (clockwise rotation)
            const rotatedXKm = dxKm * Math.cos(angleRad) - dyKm * Math.sin(angleRad);
            const rotatedYKm = dxKm * Math.sin(angleRad) + dyKm * Math.cos(angleRad);

            // Convert the rotated km offsets back to lat/lng offsets
            // For latitude: simple conversion (doesn't depend on longitude)
            const latOffsetDeg = rotatedYKm / 111.32; // 1 degree lat ≈ 111.32 km

            // For longitude: depends on latitude due to Earth's curvature
            const latRadians = center.lat * (Math.PI / 180);
            const lngOffsetDeg = rotatedXKm / (111.32 * Math.cos(latRadians));

            // Calculate the final corner position
            const cornerLat = center.lat + latOffsetDeg;
            const cornerLng = center.lng + lngOffsetDeg;

            corners.push([cornerLat, cornerLng]);
        });

        return corners;
    },

    _updateCorners: function () {
        const corners = this._calculateCorners(this._originalBounds, this._rotationAngle);
        this.setLatLngs(corners);
    }
});

// Create a rectangle using initial bounds calculated from mapSetup parameters
const initialBounds = calculateBoundsFromOriginAndExtents(
    initialOriginLat,
    initialOriginLon,
    initialExtentX,
    initialExtentY
);

const rectangle = new RotatableRectangle(initialBounds, {
    color: "#ff7800",
    weight: 2,
    fillOpacity: 0.2
}).addTo(map);

// Make rectangle globally accessible
window.rectangle = rectangle;

// Variables for rotation handle
let rotationHandle = null;
let rotationLine = null;
let rotationHandleDistance = 50; // pixels

// Variables for resize handles
let resizeHandles = {
    corners: {
        topLeft: null,
        topRight: null,
        bottomLeft: null,
        bottomRight: null
    },
    sides: {
        top: null,
        right: null,
        bottom: null,
        left: null
    }
};

// Variables for resize operations
let initialResizeHandlePos = null;
let initialRectBounds = null;
let activeResizeHandle = null;
let resizeHandleType = null; // 'corner' or 'side'
let resizeHandlePosition = null; // specific position like 'topLeft', 'top', etc.

// Variables to track interaction state
let isDragging = false;
let isResizing = false;
let isRotating = false;
let lastPos = null;
let rotationAngle = 0;
window.rotationAngle = rotationAngle; // Make global
let rectangleCenter = null;

// Create rotation handle icon
const rotationIcon = L.divIcon({
    className: 'rotation-handle-icon',
    html: '<div class="rotation-icon"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// Create resize handle icons for corners and sides
const cornerResizeIcon = L.divIcon({
    className: 'corner-resize-handle-icon',
    html: '<div class="corner-resize-icon"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const sideResizeIcon = L.divIcon({
    className: 'side-resize-handle-icon',
    html: '<div class="side-resize-icon"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
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

    // Apply rotation to this vector (clockwise rotation)
    const angle = (window.rotationAngle || 0) * (Math.PI / 180); // Positive for clockwise
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

        // Ensure rectangleCenter is set for rotation calculations
        const bounds = rectangle.getBounds();
        rectangleCenter = bounds.getCenter();

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

    // Ensure rectangleCenter is set
    if (!rectangleCenter) {
        const bounds = rectangle.getBounds();
        rectangleCenter = bounds.getCenter();
    }

    // Sync local rotationAngle with global and apply to rectangle
    rotationAngle = window.rotationAngle || 0;
    rectangle.setRotation(rotationAngle);

    // Update handle positions
    updateRotationHandlePosition();
    updateResizeHandlesPosition();
}

// Make applyRotation globally accessible
window.applyRotation = applyRotation;

// Function to create and position all resize handles
function createResizeHandles() {
    // Remove existing handles
    removeAllResizeHandles();

    updateResizeHandlesPosition();
}

// Function to remove all resize handles
function removeAllResizeHandles() {
    // Remove corner handles
    Object.values(resizeHandles.corners).forEach(handle => {
        if (handle) map.removeLayer(handle);
    });

    // Remove side handles  
    Object.values(resizeHandles.sides).forEach(handle => {
        if (handle) map.removeLayer(handle);
    });

    // Reset handle objects
    resizeHandles.corners = {
        topLeft: null,
        topRight: null,
        bottomLeft: null,
        bottomRight: null
    };
    resizeHandles.sides = {
        top: null,
        right: null,
        bottom: null,
        left: null
    };
}

// Function to update all resize handle positions when rectangle is moved or rotated
function updateResizeHandlesPosition() {
    if (!rectangle) return;

    // Remove existing handles first
    removeAllResizeHandles();

    const bounds = rectangle.getBounds();
    const center = bounds.getCenter();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const nw = L.latLng(ne.lat, sw.lng);
    const se = L.latLng(sw.lat, ne.lng);

    // Calculate rotation angle
    const angle = (window.rotationAngle || 0) * (Math.PI / 180);
    const centerPoint = map.latLngToLayerPoint(center);

    // Helper function to rotate a point around the center
    function rotatePoint(point, centerPt, angleRad) {
        const x = point.x - centerPt.x;
        const y = point.y - centerPt.y;
        const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
        const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
        return L.point(centerPt.x + rotatedX, centerPt.y + rotatedY);
    }

    // Calculate rotated corner positions
    const corners = {
        topLeft: rotatePoint(map.latLngToLayerPoint(nw), centerPoint, angle),
        topRight: rotatePoint(map.latLngToLayerPoint(ne), centerPoint, angle),
        bottomLeft: rotatePoint(map.latLngToLayerPoint(sw), centerPoint, angle),
        bottomRight: rotatePoint(map.latLngToLayerPoint(se), centerPoint, angle)
    };

    // Calculate rotated side midpoint positions
    const sides = {
        top: L.point(
            (corners.topLeft.x + corners.topRight.x) / 2,
            (corners.topLeft.y + corners.topRight.y) / 2
        ),
        right: L.point(
            (corners.topRight.x + corners.bottomRight.x) / 2,
            (corners.topRight.y + corners.bottomRight.y) / 2
        ),
        bottom: L.point(
            (corners.bottomLeft.x + corners.bottomRight.x) / 2,
            (corners.bottomLeft.y + corners.bottomRight.y) / 2
        ),
        left: L.point(
            (corners.topLeft.x + corners.bottomLeft.x) / 2,
            (corners.topLeft.y + corners.bottomLeft.y) / 2
        )
    };

    // Create corner handles
    Object.keys(corners).forEach(position => {
        const latLng = map.layerPointToLatLng(corners[position]);
        const handle = L.marker(latLng, {
            icon: cornerResizeIcon,
            draggable: false,
            zIndexOffset: 1000
        }).addTo(map);

        // Add mousedown handler
        handle.on('mousedown', function (e) {
            startResize(e, 'corner', position);
        });

        resizeHandles.corners[position] = handle;
    });

    // Create side handles
    Object.keys(sides).forEach(position => {
        const latLng = map.layerPointToLatLng(sides[position]);

        // Create a modified icon with appropriate cursor class
        const sideIcon = L.divIcon({
            className: `side-resize-handle-icon ${(position === 'left' || position === 'right') ? 'horizontal' : 'vertical'}`,
            html: '<div class="side-resize-icon"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });

        const handle = L.marker(latLng, {
            icon: sideIcon,
            draggable: false,
            zIndexOffset: 1000
        }).addTo(map);

        // Add mousedown handler
        handle.on('mousedown', function (e) {
            startResize(e, 'side', position);
        });

        resizeHandles.sides[position] = handle;
    });
}

// Helper function to start resize operation
function startResize(e, handleType, handlePosition) {
    isResizing = true;
    lastPos = e.latlng;
    map.dragging.disable();

    // Store resize operation details
    activeResizeHandle = e.target;
    resizeHandleType = handleType;
    resizeHandlePosition = handlePosition;
    initialResizeHandlePos = e.latlng;
    initialRectBounds = rectangle.getBounds();
    rectangleCenter = initialRectBounds.getCenter();

    // Prevent event propagation
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
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
map.on('mousemove', function (e) {
    if (!isDragging && !isResizing && !isRotating) return;

    // Use the map event's latlng directly for accurate positioning
    const currentLatLng = e.latlng;

    if (isRotating && rectangleCenter && lastPos) { // lastPos is a Leaflet LatLng
        // Calculate rotation angle
        // Adapt the call to calculateAngle, as it now expects {lat, lon} objects
        const angleDelta = calculateAngle(
            { lat: rectangleCenter.lat, lon: rectangleCenter.lng },
            { lat: lastPos.lat, lon: lastPos.lng },
            { lat: currentLatLng.lat, lon: currentLatLng.lng }
        );
        // Ensure rotationAngle stays within [0, 360)
        rotationAngle = (((rotationAngle + angleDelta) % 360) + 360) % 360;
        window.rotationAngle = rotationAngle; // Update global

        // Apply the rotation
        applyRotation();
    } else if (isDragging) {
        // Calculate the movement delta
        const latDiff = currentLatLng.lat - lastPos.lat;
        const lonDiff = currentLatLng.lng - lastPos.lng; // lastPos is Leaflet LatLng

        // Update rectangle position
        const currentBounds = rectangle.getBounds();
        const sw = currentBounds.getSouthWest();
        const ne = currentBounds.getNorthEast();

        rectangle.setBounds([
            [sw.lat + latDiff, sw.lng + lonDiff],
            [ne.lat + latDiff, ne.lng + lonDiff],
        ]);

        // Reapply rotation after moving (this will update handles)
        applyRotation();

        // Update form values
        updateFormValues();
    } else if (isResizing && rectangleCenter && initialResizeHandlePos && initialRectBounds) {
        // Handle different resize modes based on handle type and position
        if (resizeHandleType === 'corner') {
            handleCornerResize(currentLatLng);
        } else if (resizeHandleType === 'side') {
            handleSideResize(currentLatLng);
        }
    }

    // Update last position
    lastPos = currentLatLng;
});

// End interaction on mouseup
map.on('mouseup', function () {
    if (!(isDragging || isResizing || isRotating)) return;

    // End interaction
    isDragging = false;
    isResizing = false;
    isRotating = false;
    lastPos = null;

    // Clear resize state
    activeResizeHandle = null;
    resizeHandleType = null;
    resizeHandlePosition = null;
    initialResizeHandlePos = null;
    initialRectBounds = null;

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
            createResizeHandles();
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

// Handle corner resize - keeps opposite corner fixed
function handleCornerResize(currentLatLng) {
    const currentMousePoint = map.latLngToContainerPoint(currentLatLng);
    const initialMousePoint = map.latLngToContainerPoint(initialResizeHandlePos);

    // Calculate mouse movement in screen coordinates
    const dx = currentMousePoint.x - initialMousePoint.x;
    const dy = currentMousePoint.y - initialMousePoint.y;

    // If the rectangle is not rotated, use simple bounds-based resizing
    if (Math.abs(window.rotationAngle || 0) < 0.01) {
        // Get the original bounds
        const origSW = initialRectBounds.getSouthWest();
        const origNE = initialRectBounds.getNorthEast();
        const origNW = L.latLng(origNE.lat, origSW.lng);
        const origSE = L.latLng(origSW.lat, origNE.lng);

        // Determine which corner is being dragged and which should stay fixed
        let fixedCorner, movingCorner;
        switch (resizeHandlePosition) {
            case 'topLeft':
                fixedCorner = origSE;
                movingCorner = origNW;
                break;
            case 'topRight':
                fixedCorner = origSW;
                movingCorner = origNE;
                break;
            case 'bottomLeft':
                fixedCorner = origNE;
                movingCorner = origSW;
                break;
            case 'bottomRight':
                fixedCorner = origNW;
                movingCorner = origSE;
                break;
        }

        // Convert the moving corner to screen coordinates and apply movement
        const movingCornerPoint = map.latLngToContainerPoint(movingCorner);
        const newMovingCornerPoint = L.point(
            movingCornerPoint.x + dx,
            movingCornerPoint.y + dy
        );
        const newMovingCorner = map.containerPointToLatLng(newMovingCornerPoint);

        // Create new bounds from fixed corner and new moving corner
        const newBounds = L.latLngBounds([fixedCorner, newMovingCorner]);

        // Apply minimum size constraints
        const minSize = 0.001; // Minimum size in degrees
        if (Math.abs(newBounds.getEast() - newBounds.getWest()) < minSize ||
            Math.abs(newBounds.getNorth() - newBounds.getSouth()) < minSize) {
            return; // Don't update if too small
        }

        rectangle.setBounds(newBounds);
        updateFormValues();
        return;
    }

    // For rotated rectangles, we need to work with the actual rotated corners
    // Get the current rotated rectangle corners from the polygon points
    const currentCorners = rectangle.getLatLngs()[0]; // First ring of the polygon

    // The corners are in order: [SW, SE, NE, NW] after rotation
    const currentSW = currentCorners[0];
    const currentSE = currentCorners[1];
    const currentNE = currentCorners[2];
    const currentNW = currentCorners[3];

    // Map handle positions to actual corner positions
    let fixedCorner, movingCorner;
    switch (resizeHandlePosition) {
        case 'topLeft':
            fixedCorner = currentSE;    // bottom-right stays fixed
            movingCorner = currentNW;   // top-left moves
            break;
        case 'topRight':
            fixedCorner = currentSW;    // bottom-left stays fixed  
            movingCorner = currentNE;   // top-right moves
            break;
        case 'bottomLeft':
            fixedCorner = currentNE;    // top-right stays fixed
            movingCorner = currentSW;   // bottom-left moves
            break;
        case 'bottomRight':
            fixedCorner = currentNW;    // top-left stays fixed
            movingCorner = currentSE;   // bottom-right moves
            break;
    }

    // Convert to screen coordinates
    const fixedPoint = map.latLngToContainerPoint(fixedCorner);
    const movingPoint = map.latLngToContainerPoint(movingCorner);

    // Calculate new position of the moving corner
    const newMovingPoint = L.point(
        movingPoint.x + dx,
        movingPoint.y + dy
    );

    // Get the other two corners to form the complete rectangle
    let otherCorner1, otherCorner2;
    switch (resizeHandlePosition) {
        case 'topLeft':
            otherCorner1 = currentSW;   // bottom-left
            otherCorner2 = currentNE;   // top-right
            break;
        case 'topRight':
            otherCorner1 = currentNW;   // top-left
            otherCorner2 = currentSE;   // bottom-right
            break;
        case 'bottomLeft':
            otherCorner1 = currentNW;   // top-left
            otherCorner2 = currentSE;   // bottom-right
            break;
        case 'bottomRight':
            otherCorner1 = currentSW;   // bottom-left
            otherCorner2 = currentNE;   // top-right
            break;
    }

    // Convert other corners to screen coordinates
    const otherPoint1 = map.latLngToContainerPoint(otherCorner1);
    const otherPoint2 = map.latLngToContainerPoint(otherCorner2);

    // Calculate the rectangle's local axes using the current rectangle orientation
    // Vector from fixed corner to each adjacent corner
    const axis1X = otherPoint1.x - fixedPoint.x;
    const axis1Y = otherPoint1.y - fixedPoint.y;
    const axis2X = otherPoint2.x - fixedPoint.x;
    const axis2Y = otherPoint2.y - fixedPoint.y;

    // Normalize the axes
    const axis1Length = Math.sqrt(axis1X * axis1X + axis1Y * axis1Y);
    const axis2Length = Math.sqrt(axis2X * axis2X + axis2Y * axis2Y);

    if (axis1Length < 1 || axis2Length < 1) return; // Avoid division by zero

    const axis1UnitX = axis1X / axis1Length;
    const axis1UnitY = axis1Y / axis1Length;
    const axis2UnitX = axis2X / axis2Length;
    const axis2UnitY = axis2Y / axis2Length;

    // Project the mouse movement onto the rectangle's local axes
    const deltaX = newMovingPoint.x - fixedPoint.x;
    const deltaY = newMovingPoint.y - fixedPoint.y;

    const proj1 = deltaX * axis1UnitX + deltaY * axis1UnitY;
    const proj2 = deltaX * axis2UnitX + deltaY * axis2UnitY;

    // Apply minimum size constraints
    const minSizePixels = 20;
    if (Math.abs(proj1) < minSizePixels || Math.abs(proj2) < minSizePixels) {
        return;
    }

    // Calculate new corner positions
    const newOtherPoint1 = L.point(
        fixedPoint.x + proj1 * axis1UnitX,
        fixedPoint.y + proj1 * axis1UnitY
    );

    const newOtherPoint2 = L.point(
        fixedPoint.x + proj2 * axis2UnitX,
        fixedPoint.y + proj2 * axis2UnitY
    );

    const newOppositePoint = L.point(
        fixedPoint.x + proj1 * axis1UnitX + proj2 * axis2UnitX,
        fixedPoint.y + proj1 * axis1UnitY + proj2 * axis2UnitY
    );

    // Convert back to lat/lng
    const newFixedCorner = fixedCorner; // This stays the same
    const newOtherCorner1 = map.containerPointToLatLng(newOtherPoint1);
    const newOtherCorner2 = map.containerPointToLatLng(newOtherPoint2);
    const newOppositeCorner = map.containerPointToLatLng(newOppositePoint);

    // Create new polygon with the updated corners in the correct order
    let newCorners;
    switch (resizeHandlePosition) {
        case 'topLeft':
            // Fixed: SE, Moving: NW, Others: SW, NE
            newCorners = [newOtherCorner1, newFixedCorner, newOtherCorner2, newOppositeCorner]; // [SW, SE, NE, NW]
            break;
        case 'topRight':
            // Fixed: SW, Moving: NE, Others: NW, SE  
            newCorners = [newFixedCorner, newOtherCorner2, newOppositeCorner, newOtherCorner1]; // [SW, SE, NE, NW]
            break;
        case 'bottomLeft':
            // Fixed: NE, Moving: SW, Others: NW, SE
            newCorners = [newOppositeCorner, newOtherCorner2, newFixedCorner, newOtherCorner1]; // [SW, SE, NE, NW]
            break;
        case 'bottomRight':
            // Fixed: NW, Moving: SE, Others: SW, NE
            newCorners = [newOtherCorner1, newOppositeCorner, newOtherCorner2, newFixedCorner]; // [SW, SE, NE, NW]
            break;
    }

    // Update the polygon directly with new corners
    rectangle.setLatLngs([newCorners]);

    // Calculate and update bounds for form values
    const newBounds = L.latLngBounds(newCorners);
    rectangle._originalBounds = newBounds;

    // Update form values
    updateFormValues();
}

// Handle side resize - keeps opposite side fixed
function handleSideResize(currentLatLng) {
    const currentMousePoint = map.latLngToContainerPoint(currentLatLng);
    const initialMousePoint = map.latLngToContainerPoint(initialResizeHandlePos);

    // Calculate movement delta in screen coordinates
    const dx = currentMousePoint.x - initialMousePoint.x;
    const dy = currentMousePoint.y - initialMousePoint.y;

    // Get the original bounds
    const origSW = initialRectBounds.getSouthWest();
    const origNE = initialRectBounds.getNorthEast();
    const origNW = L.latLng(origNE.lat, origSW.lng);
    const origSE = L.latLng(origSW.lat, origNE.lng);

    // Calculate the center and rotation
    const center = initialRectBounds.getCenter();
    const angle = (window.rotationAngle || 0) * Math.PI / 180;
    const centerPoint = map.latLngToContainerPoint(center);

    // Helper function to rotate a point around center
    function rotatePoint(point, centerPt, angleRad) {
        const x = point.x - centerPt.x;
        const y = point.y - centerPt.y;
        const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
        const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
        return L.point(centerPt.x + rotatedX, centerPt.y + rotatedY);
    }

    // Get the current rotated corner positions in screen coordinates
    const rotatedCorners = {
        sw: rotatePoint(map.latLngToContainerPoint(origSW), centerPoint, angle),
        se: rotatePoint(map.latLngToContainerPoint(origSE), centerPoint, angle),
        ne: rotatePoint(map.latLngToContainerPoint(origNE), centerPoint, angle),
        nw: rotatePoint(map.latLngToContainerPoint(origNW), centerPoint, angle)
    };

    // Calculate the direction vectors for each side of the rotated rectangle
    let sideVector, perpVector;

    switch (resizeHandlePosition) {
        case 'top':
            // Top side vector (from nw to ne)
            sideVector = L.point(
                rotatedCorners.ne.x - rotatedCorners.nw.x,
                rotatedCorners.ne.y - rotatedCorners.nw.y
            );
            break;
        case 'bottom':
            // Bottom side vector (from sw to se)
            sideVector = L.point(
                rotatedCorners.se.x - rotatedCorners.sw.x,
                rotatedCorners.se.y - rotatedCorners.sw.y
            );
            break;
        case 'left':
            // Left side vector (from sw to nw)
            sideVector = L.point(
                rotatedCorners.nw.x - rotatedCorners.sw.x,
                rotatedCorners.nw.y - rotatedCorners.sw.y
            );
            break;
        case 'right':
            // Right side vector (from se to ne)
            sideVector = L.point(
                rotatedCorners.ne.x - rotatedCorners.se.x,
                rotatedCorners.ne.y - rotatedCorners.se.y
            );
            break;
    }

    // Calculate the perpendicular vector (normal to the side)
    perpVector = L.point(-sideVector.y, sideVector.x);

    // Normalize the perpendicular vector
    const perpLength = Math.sqrt(perpVector.x * perpVector.x + perpVector.y * perpVector.y);
    if (perpLength > 0) {
        perpVector.x /= perpLength;
        perpVector.y /= perpLength;
    }

    // Project the mouse movement onto the perpendicular direction
    const projectedDistance = dx * perpVector.x + dy * perpVector.y;

    // Calculate the movement vector for this side
    const moveVector = L.point(
        projectedDistance * perpVector.x,
        projectedDistance * perpVector.y
    );

    // Apply the movement to the appropriate corners
    let newCorners = { ...rotatedCorners };

    switch (resizeHandlePosition) {
        case 'top':
            // Move only the top edge
            newCorners.ne = L.point(rotatedCorners.ne.x + moveVector.x, rotatedCorners.ne.y + moveVector.y);
            newCorners.nw = L.point(rotatedCorners.nw.x + moveVector.x, rotatedCorners.nw.y + moveVector.y);
            break;
        case 'bottom':
            // Move only the bottom edge
            newCorners.sw = L.point(rotatedCorners.sw.x + moveVector.x, rotatedCorners.sw.y + moveVector.y);
            newCorners.se = L.point(rotatedCorners.se.x + moveVector.x, rotatedCorners.se.y + moveVector.y);
            break;
        case 'left':
            // Move only the left edge
            newCorners.sw = L.point(rotatedCorners.sw.x + moveVector.x, rotatedCorners.sw.y + moveVector.y);
            newCorners.nw = L.point(rotatedCorners.nw.x + moveVector.x, rotatedCorners.nw.y + moveVector.y);
            break;
        case 'right':
            // Move only the right edge
            newCorners.se = L.point(rotatedCorners.se.x + moveVector.x, rotatedCorners.se.y + moveVector.y);
            newCorners.ne = L.point(rotatedCorners.ne.x + moveVector.x, rotatedCorners.ne.y + moveVector.y);
            break;
    }

    // Calculate the new center from the moved corners
    const newCenterX = (newCorners.sw.x + newCorners.se.x + newCorners.ne.x + newCorners.nw.x) / 4;
    const newCenterY = (newCorners.sw.y + newCorners.se.y + newCorners.ne.y + newCorners.nw.y) / 4;
    const newCenterPoint = L.point(newCenterX, newCenterY);

    // Calculate the new "unrotated" bounds by rotating the corners back
    function unrotatePoint(point, centerPt, angleRad) {
        const x = point.x - centerPt.x;
        const y = point.y - centerPt.y;
        const unrotatedX = x * Math.cos(-angleRad) - y * Math.sin(-angleRad);
        const unrotatedY = x * Math.sin(-angleRad) + y * Math.cos(-angleRad);
        return L.point(centerPt.x + unrotatedX, centerPt.y + unrotatedY);
    }

    // Unrotate the new corners to get the underlying rectangle bounds
    const unrotatedCorners = {
        sw: unrotatePoint(newCorners.sw, newCenterPoint, angle),
        se: unrotatePoint(newCorners.se, newCenterPoint, angle),
        ne: unrotatePoint(newCorners.ne, newCenterPoint, angle),
        nw: unrotatePoint(newCorners.nw, newCenterPoint, angle)
    };

    // Convert unrotated corners to lat/lng and create bounds
    const unrotatedSW = map.containerPointToLatLng(unrotatedCorners.sw);
    const unrotatedNE = map.containerPointToLatLng(unrotatedCorners.ne);

    // Create new bounds
    const newBounds = L.latLngBounds([unrotatedSW, unrotatedNE]);

    // Apply minimum size constraints
    const minSize = 0.001; // Minimum size in degrees
    if (Math.abs(newBounds.getEast() - newBounds.getWest()) < minSize ||
        Math.abs(newBounds.getNorth() - newBounds.getSouth()) < minSize) {
        return; // Don't update if too small
    }

    // Update the rectangle bounds
    rectangle.setBounds(newBounds);

    // Reapply rotation to update handles
    applyRotation();

    // Update form values
    updateFormValues();
}
