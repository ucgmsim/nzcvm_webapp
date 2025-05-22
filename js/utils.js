// Utility functions for handling geographic coordinates and grid calculations

// Function to convert kilometers to degrees latitude/longitude
function kmToDegrees(km, centerLat) {
    // Earth's radius in km at the equator
    const earthRadius = 6371;

    // Conversion for latitude is straightforward
    const latDegrees = km / 111.32; // 1 degree latitude is approximately 111.32 km

    // Longitude depends on the latitude due to the Earth's curvature
    const latRadians = centerLat * (Math.PI / 180);
    const lonDegrees = km / (111.32 * Math.cos(latRadians));

    return { lat: latDegrees, lon: lonDegrees };
}

// Function to convert degrees to kilometers
function degreesToKm(lat, lon, centerLat) {
    const latKm = lat * 111.32; // 1 degree latitude is approximately 111.32 km

    const latRadians = centerLat * (Math.PI / 180);
    const lonKm = lon * (111.32 * Math.cos(latRadians));

    return { latKm, lonKm };
}

// Function to calculate rectangle bounds from origin and extents
function calculateBoundsFromOriginAndExtents(originLat, originLon, extentX, extentY) {
    // Convert extents from kilometers to degrees
    const extentsDegrees = kmToDegrees(extentX / 2, originLat);
    const extentsDegreesY = kmToDegrees(extentY / 2, originLat);

    // Calculate southwest and northeast corners
    const swLat = originLat - extentsDegreesY.lat;
    const swLon = originLon - extentsDegrees.lon;
    const neLat = originLat + extentsDegreesY.lat;
    const neLon = originLon + extentsDegrees.lon;

    return [
        [swLat, swLon], // Southwest corner
        [neLat, neLon]  // Northeast corner
    ];
}


/**
 * Calculate the angle in degrees between two vectors formed by three points.
 * The vectors are (p1 - center) and (p2 - center).
 * The angle is measured from the vector (center to p1) to the vector (center to p2).
 *
 * @param {{lat: number, lon: number}} center - The common point (vertex) of the two vectors.
 * @param {{lat: number, lon: number}} p1 - The end point of the first vector.
 * @param {{lat: number, lon: number}} p2 - The end point of the second vector.
 * @returns {number} The angle in degrees. Positive values indicate a counter-clockwise
 *                   angle from vector (center-p1) to vector (center-p2).
 */
// Calculate angle between three points (used for rotation)
function calculateAngle(center, p1, p2) {
    const angle1 = Math.atan2(p1.lat - center.lat, p1.lon - center.lon);
    const angle2 = Math.atan2(p2.lat - center.lat, p2.lon - center.lon);
    return ((angle2 - angle1) * 180 / Math.PI);
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
    // Ensure nz is at least 1 if zmax equals zmin
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


/**
 * Calculate the estimated run time based on the total number of grid points.
 * The parameters in this approximation formula were derived by fitting a linear
 * model to the run times as a function of the total number of grid points 
 * for several test runs on Mantle.
 *
 * @param {number} totalGridPoints - The total number of grid points (nx * ny * nz).
 * @returns {number} The estimated run time in seconds. Returns NaN if input is invalid.
 */
function calculateApproxRunTime(totalGridPoints) {
    if (isNaN(totalGridPoints) || totalGridPoints <= 0) {
        return NaN; // Return NaN for invalid input
    }
    // The parameters in this approximation formula were derived by fitting a linear
    // model to the run times as a function of the total number of grid points 
    // for several test runs on Mantle.
    return 33 + totalGridPoints * 2.6014383829e-5;
}
