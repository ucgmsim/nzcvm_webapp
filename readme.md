## Introduction

The New Zealand Community Velocity Model (NZCVM) web app makes it easy to
generate models that describe the velocity of seismic wave propagation 
throughout New Zealand.

This repo contains all the files needed to set up this web app. Set up instructions
are below.

## Build and push images of the required Docker containers

These steps can be carried out on any machine that has Docker (i.e., they do not need to be carried out on the machine that will host the website).  

* Clone this repo
    * `git clone https://github.com/ucgmsim/nzcvm_webapp.git /nzcvm_webapp`

* In a terminal, navigate to the top level of cloned repo  (where the file docker-compose.yaml is located). The location will depend on where you cloned the repo to
    * e.g., `cd /home/username/nzcvm_webapp`

* Build the Docker images
    * `docker compose build .` (if any cached `nzcvm_webapp` source files can be kept)

    * `docker compose build . --no-cache` (if any cached `nzcvm_webapp` source files should be overwritten, for example if `nzcvm_webapp` has been updated)

* Push the images to Docker Hub (see the section below on logging in to Docker Hub)
    * `docker compose push`

## Create a dedicated user account on the host machine to run the service

This guide uses **Rootless Docker**, meaning that the Docker installation is for a specific user that does not require `sudo`. If you need to install Rootless Docker on your system, follow [this guide](https://docs.docker.com/engine/security/rootless/).

* Create a user called `nzcvm_webapp` to run the systemd service
    *  `sudo useradd -m -s /bin/bash nzcvm_webapp` where `-m` creates a home directory and `-s /bin/bash` sets the default shell to bash.

* Add the following line to the `nzcvm_webapp` user's `~/.bashrc` file to point to the user's Docker socket
    * `export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock`

* Reload the shell
    * `source ~/.bashrc`

* Temporarily give the `nzcvm_webapp` user `sudo` privileges to make the next few steps simpler (`sudo` privileges will be revoked later)
    *  `sudo usermod -aG sudo nzcvm_webapp`

* Change to the `nzcvm_webapp` user
    * e.g., `exit`
    * e.g., `ssh nzcvm_webapp@mantle` (if hosting on Mantle)

* Set the `nzcvm_webapp` user's Docker to start at startup and also start it now 
    * `sudo systemctl enable --now docker` where `enable` sets Docker to start at startup and `--now` also starts it now.

* Allow the `nzcvm_webapp` user to linger so it will be available at startup 
    * `sudo loginctl enable-linger $(whoami)`

* Create directories for the repo and NZCVM's data resources
    * `sudo mkdir /mnt/mantle_data/nzcvm_webapp/repo`
    * `sudo mkdir /mnt/mantle_data/nzcvm_webapp/nzcvm_data/`

* Give the nzcvm_webapp user all permissions for these directories
    * `sudo chown -R nzcvm_webapp:nzcvm_webapp /mnt/mantle_data/nzcvm_webapp`
    * `sudo chmod -R u+rwx /mnt/mantle_data/nzcvm_webapp`

* Copy the data resources required for the NZCVM code to `/mnt/mantle_data/nzcvm_webapp/nzcvm_data/`
    * e.g., use rsync or sftp

* Change to another account that has `sudo` privileges
    * e.g., `exit`
    * e.g., `ssh main_username@mantle`

* Revoke the `nzcvm_webapp` user's `sudo` privileges as they are no longer needed 
    * `sudo deluser nzcvm_webapp sudo`

## Set up and start the systemd service file

* Copy the `nzcvm_webapp.service` file to the host machine
    * e.g., `cp nzcvm_webapp.service /etc/systemd/system/`
* Reload the systemd unit files
    *  `sudo systemctl daemon-reload`
* Set the service to start on startup with `enable`
    * `sudo systemctl enable nzcvm_webapp.service`

* Start the service to pull the latest images from Docker Hub and run the containers
    * `sudo systemctl start nzcvm_webapp.service` (if **not** already running)
    * `sudo systemctl restart nzcvm_webapp.service` (if already running)

* Check the status of the service to ensure it's running
    * `sudo systemctl status nzcvm_webapp.service` 

* Check the status of the `nzcvm_webapp` container (as the `nzcvm_webapp` user)
    * `docker ps`

## Logging in to Docker Hub
Open a terminal and enter the following command:
`docker login`

The terminal will show a message like the following:

    USING WEB BASED LOGIN
    To sign in with credentials on the command line, use 'docker login -u <username>'

    Your one-time device confirmation code is: XXXX-XXXX
    Press ENTER to open your browser or submit your device code here: https://login.docker.com/activate

    Waiting for authentication in the browser…

If a web browser does not open automatically, copy the URL provided in the message and 
paste it into a web browser. On the web page that opens, enter the one-time device 
confirmation code provided in the message, and our organization's Docker Hub username 
and password to log in.

## File summaries

The functions of the following files are summarised below. See the comments in the files for more information.

- [nzcvm_webapp.service](nzcvm_webapp.service): The systemd service file 
- [docker-compose.yml](docker-compose.yml): Tells Docker how to run the containers. All `docker compose ...` commands require this file.
- [nzcvm_webapp_backend/Dockerfile](nzcvm_webapp_backend/Dockerfile): Tells Docker how to build the backend's image
- [nzcvm_webapp_backend/requirements.txt](nzcvm_webapp_backend/requirements.txt): Required packages for the Python backend app
- [nzcvm_webapp_frontend/Dockerfile](nzcvm_webapp_frontend/Dockerfile): Tells Docker how to build the frontend's image
- [nzcvm_webapp_frontend/nginx.conf](nzcvm_webapp_frontend/nginx.conf): Configuration for the frontend's Nginx server.
- [2p_nginx.config.conf](2p_nginx.config.conf): The location blocks for 2p's Nginx config file to set up the proxy pass to Mantle