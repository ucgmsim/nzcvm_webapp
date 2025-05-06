import L from "leaflet";
import AutoGraticule from "leaflet-auto-graticule";

// Initialize map centered on New Zealand
export const map = L.map('map').setView([-41.2865, 174.7762], 6);
window.map = map; // Make global for non-module scripts

// Add tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Add auto-graticule
new AutoGraticule().addTo(map);

// Define initial parameters for the rectangle (used by rectangleControls)
export const initialOriginLat = -41.2865;
window.initialOriginLat = initialOriginLat; // Make global

export const initialOriginLng = 174.7762;
window.initialOriginLng = initialOriginLng; // Make global

export const initialExtentX = 300; // width in km
window.initialExtentX = initialExtentX; // Make global

export const initialExtentY = 300; // height in km
window.initialExtentY = initialExtentY; // Make global
