// filepath: /home/arr65/src/nzcvm_webapp/js/mapSetup.js

// Initialize map centered on New Zealand
const map = L.map('map').setView([-41.2865, 174.7762], 6);

// Add tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Define initial parameters for the rectangle (used by rectangleControls)
const initialOriginLat = -41.2865;
const initialOriginLng = 174.7762;
const initialExtentX = 300; // width in km
const initialExtentY = 300; // height in km
