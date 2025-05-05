// filepath: /home/arr65/src/nzcvm_webapp/js/utils.js

// Function to convert kilometers to degrees latitude/longitude
function kmToDegrees(km, centerLat) {
    // Earth's radius in km at the equator
    const earthRadius = 6371;

    // Conversion for latitude is straightforward
    const latDegrees = km / 111.32; // 1 degree latitude is approximately 111.32 km

    // Longitude depends on the latitude due to the Earth's curvature
    const latRadians = centerLat * (Math.PI / 180);
    const lngDegrees = km / (111.32 * Math.cos(latRadians));

    return { lat: latDegrees, lng: lngDegrees };
}

// Function to convert degrees to kilometers
function degreesToKm(lat, lng, centerLat) {
    const latKm = lat * 111.32; // 1 degree latitude is approximately 111.32 km

    const latRadians = centerLat * (Math.PI / 180);
    const lngKm = lng * (111.32 * Math.cos(latRadians));

    return { latKm, lngKm };
}

// Function to calculate rectangle bounds from origin and extents
function calculateBoundsFromOriginAndExtents(originLat, originLng, extentX, extentY) {
    // Convert extents from kilometers to degrees
    const extentsDegrees = kmToDegrees(extentX / 2, originLat);
    const extentsDegreesY = kmToDegrees(extentY / 2, originLat);

    // Calculate southwest and northeast corners
    const swLat = originLat - extentsDegreesY.lat;
    const swLng = originLng - extentsDegrees.lng;
    const neLat = originLat + extentsDegreesY.lat;
    const neLng = originLng + extentsDegrees.lng;

    return [
        [swLat, swLng], // Southwest corner
        [neLat, neLng]  // Northeast corner
    ];
}

/**
 * Calculate the dimensions and total number of points in a 3D velocity model grid.
 *
 * @param {number} extentX - X extent of the model in km.
 * @param {number} extentY - Y extent of the model in km.
 * @param {number} extentLatlonSpacing - Horizontal grid spacing in km.
 * @param {number} extentZmax - Maximum depth in km.
 * @param {number} extentZmin - Minimum depth in km.
 * @param {number} extentZSpacing - Vertical grid spacing in km.
 * @returns {{nx: number, ny: number, nz: number, totalGridPoints: number}} An object containing nx, ny, nz, and total_grid_points.
 */
function calculateGridPoints(extentX, extentY, extentLatlonSpacing, extentZmax, extentZmin, extentZSpacing) {
    // Validate inputs - return null or default values if invalid
    if (isNaN(extentX) || isNaN(extentY) || isNaN(extentLatlonSpacing) || isNaN(extentZmax) || isNaN(extentZmin) || isNaN(extentZSpacing) || extentLatlonSpacing <= 0 || extentZSpacing <= 0) {
        return { nx: NaN, ny: NaN, nz: NaN, totalGridPoints: NaN };
    }

    // Calculate grid dimensions
    const nx = Math.round(extentX / extentLatlonSpacing);
    const ny = Math.round(extentY / extentLatlonSpacing);
    // Ensure nz is at least 1 if zmax equals zmin, handle potential division by zero if zSpacing is 0 (already checked above)
    const nz = Math.max(1, Math.round((extentZmax - extentZmin) / extentZSpacing));

    // Calculate total number of grid points
    const totalGridPoints = nx * ny * nz;

    return {
        nx: nx,
        ny: ny,
        nz: nz,
        totalGridPoints: totalGridPoints
    };
}

// Calculate angle between three points (used for rotation)
function calculateAngle(center, p1, p2) {
    const angle1 = Math.atan2(p1.lat - center.lat, p1.lng - center.lng);
    const angle2 = Math.atan2(p2.lat - center.lat, p2.lng - center.lng);
    return ((angle2 - angle1) * 180 / Math.PI);
}
