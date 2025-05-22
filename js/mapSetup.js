// This file sets up the Leaflet map
// Leaflet.AutoGraticule was implemented following the example at:
// https://www.npmjs.com/package/leaflet-auto-graticule

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

// Custom Control to display mouse coordinates
const CoordinatesControl = L.Control.extend({
    onAdd: function (map) {
        this._div = L.DomUtil.create('div', 'leaflet-control-coordinates'); // Create a div with a class for styling
        this._div.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        this._div.style.padding = '2px 5px';
        this._div.style.borderRadius = '3px';
        this.updateText('Lat: -, Lon: -');
        return this._div;
    },

    updateText: function (text) {
        this._div.innerHTML = text;
    }
});

const coordinatesControl = new CoordinatesControl({ position: 'bottomleft' });
map.addControl(coordinatesControl);

// Update coordinates on mousemove
map.on('mousemove', function (e) {
    const lat = e.latlng.lat.toFixed(4);
    const lon = e.latlng.lng.toFixed(4); // e.latlng.lng is from Leaflet
    coordinatesControl.updateText(`Lat: ${lat}, Lon: ${lon}`);
});

// Clear coordinates when mouse leaves the map
map.on('mouseout', function () {
    coordinatesControl.updateText('Lat: -, Lon: -');
});


// Define initial parameters for the rectangle (used by rectangleControls)
export const initialOriginLat = -41.2865;
window.initialOriginLat = initialOriginLat; // Make global

export const initialOriginLon = 174.7762;
window.initialOriginLon = initialOriginLon; // Make global

export const initialExtentX = 300; // width in km
window.initialExtentX = initialExtentX; // Make global

export const initialExtentY = 300; // height in km
window.initialExtentY = initialExtentY; // Make global
