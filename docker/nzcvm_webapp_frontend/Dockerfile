# Use the official Nginx image based on Alpine Linux
FROM nginx:alpine

# Remove the default Nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Copy the custom Nginx configuration file from the build context
# The source path is relative to the build context defined in docker-compose.yml
COPY docker/nzcvm_webapp_frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the static frontend files (HTML, CSS, JS, data)
# Assuming the build context is /home/arr65/src/nzcvm_config
COPY ../../index.html /usr/share/nginx/html/
COPY ../../css /usr/share/nginx/html/css
COPY ../../js /usr/share/nginx/html/js
COPY ../../data /usr/share/nginx/html/data

# Expose port 80 (Nginx default)
EXPOSE 80

# The base Nginx image already has a CMD to start Nginx
