# Specifies that Alpine Linux be used as the base image for the Docker container.
# Ubuntu Linux can also be used, but the resulting images are approximately 10 times larger.
FROM python:3.12-alpine  

# Uses Alpine’s package manager `apk` to install the necessary packages (`git`, `nginx`, 
# `sqlite` libraries, and `uwsgi` for `Python3`) without caching, which helps keep the image size small.
RUN apk add --no-cache git nginx

# Clone the repository with the dev branch
RUN git clone -b dev https://github.com/ucgmsim/nzcvm_config.git

# Copies the `start.sh` script from the build context into the container’s root directory.
COPY start.sh /start.sh  

# Grants execute permission to the `start.sh` script so that it can be run as a command when the container starts.
RUN chmod +x /start.sh && \
    chown -R nginx:nginx /nzcvm_config

# Copies the `nginx.conf` file from the build context into the container’s `/etc/nginx/` directory, 
# replacing the default nginx configuration.
COPY nginx.conf /etc/nginx/nginx.conf  

# Expose port 80
EXPOSE 80

# Sets the default command to run when the container starts; it executes the `start.sh` script, 
# which starts nginx in the foreground.
CMD ["/start.sh"]