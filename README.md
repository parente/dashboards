# Jupyter Dynamic Dashboards from Notebooks

Extensions for Jupyter / IPython Notebook to enable the layout and deployment of dashboards from notebooks.

## What It Gives You

Watch from minute 41 to 51 of the [September 1st Jupyter meeting video recording](https://www.youtube.com/watch?v=SJiezXPhVv8). 

* Dashboard layout mode for arranging notebook cell outputs in a grid-like fashion
* Dashboard view mode for interacting with an assembled dashboard within the Jupyter Notebook
* Ability to share notebooks with dashboard layout metadata in them with other Jupyter Notebook
* Ability to nbconvert a notebook to a separate dashboard web application

## What It Lacks

* Robust story for independent dashboard deployment (see below)
* Frontend tests
* More backend tests
* User docs / tutorials

## Runtime Requirements

* IPython Notebook 3.2.x (not Jupyter Notebook 4.x, yet) running on Python 3.x
* Notebook instance running out of `profile_default`
* [gridstack](http://troolee.github.io/gridstack.js/)
* [font-awesome](https://fortawesome.github.io/Font-Awesome/), [thebe](https://github.com/oreillymedia/thebe) (for deployed dashboards only)
* Declarative widgets extension and its dependencies (for the taxi demo)

N.B.: These are satisfied automatically when you follow the setup instructions below.

## Try It

We're running a tmpnb instance at [http://jupyter.cloudet.xyz](http://jupyter.cloudet.xyz) with a snapshot of this project (and other related incubator projects) pre-installed.

## Develop

This repository is setup for a Dockerized development environment. On a Mac, do this one-time setup if you don't have a local Docker environment yet.

```
brew update

# make sure we have node and npm for frontend preprocessing
brew install npm node

# make sure you're on Docker >= 1.7
brew install docker-machine docker
docker-machine create -d virtualbox dev
eval "$(docker-machine env dev)"
```

Pull the Docker image that we'll use for development (including bower because we want to work with declarative widgets).

```
docker pull cloudet/pyspark-notebook-bower
```

Clone this repository in a local directory that docker can volume mount:

```
# make a directory under ~ to put source
mkdir -p ~/projects
cd !$

# clone this repo
git clone https://github.com/jupyter-incubator/dashboards.git
```

Run the notebook server in a docker container:

```
# run notebook server in container
cd dashboards
make dev
```

The final `make` command starts a local Docker container with the critical pieces of the source tree mounted where they need to be to get picked up by the notebook server in the container. Most code changes on your Mac will have immediate effect within the container.

To see the Jupyter instance with extensions working:

1. Run `docker-machine ls` and note the IP of the dev machine.
2. Visit http://THAT_IP:9500 in your browser

See the Makefile for other dev, test, build commands as well as options for each command.

### Add Declarative Widgets

If you want to try the `taxi_demo` which combines the declarative widgets and a dashboard capabilities, do the following

```
# On your host, also clone the widgets project if you want to try dashboard+widgets together
git clone https://github.com/jupyter-incubator/declarativewidgets.git

# Build both projects into source tarballs
cd declarativewidgets
make sdist
cd ../dashboards
make sdist

# Run a container that installs both
make demo
```

To see the Jupyter instance with both extensions working:

1. Run `docker-machine ls` and note the IP of the dev machine.
2. Visit http://THAT_IP:9500 in your browser

## Deploy

It's within the scope of this incubator project to allow users to both:

1. Dashboard layouts within notebooks, persist the layout metadata within the notebook JSON, and share those dashboard-notebooks with other Jupyter users, and
2. Convert and deploy dashboard-notebooks as standalone web applications. 

At the moment, the second point is still very much a proof of concept. It currently relies on [thebe](https://github.com/oreillymedia/thebe) as a client for talking to a remote kernel, [tmpnb](https://github.com/jupyter/tmpnb) for provisioning remote kernels, and proper configuration of the kernel environment so that dashboard-launched kernels have access to the same data, libraries, etc. as the notebook authoring environment.

If you'd like to try external deployment today, you can do one of two things. 

First, you can click *File &rarr; Deploy As &rarr; Local Dashboard*. This will use the local Jupyter Notebook instance both as a static web server for the dashboard assets (via the `/files` endpoint) and as the kernel provisioner (via `/api/kernels`). Keep in mind, however, that kernels launched by Thebe are not tracked in the Notebook UI and cannot be cleaned up easily.

Alternatively, if you have a tmpnb instance running somewhere that spawns Notebook server containers with access to all the same libraries, extensions, and data as the notebook server you used to author the dashboard-notebook, you can click *File &rarr; Download As &rarr; Dashboard Bundle (.zip)*. Unzip the file your browser downloads and follow the README contained within to run a standalone web server for the dashboard frontend and configure it  with a pointer to your tmpnb deployment.
