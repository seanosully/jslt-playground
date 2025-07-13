# JSLT Playground

This repository contains a small web interface for experimenting with [JSLT](https://github.com/schibsted/jslt). The playground consists of a Node.js backend that invokes the JSLT command line tool and a React based frontend.

Follow the steps below to run the playground locally.

## Prerequisites

* **Node.js** and **npm** (any recent LTS release works)
* **Java** (JDK 8 or newer) – required by the JSLT CLI used by the backend
* **Git** to clone the repository

## Clone the repository

```bash
git clone <repo-url>
cd jslt-playground
```

The project directory has three main folders:

* `server/` – Express backend with `jslt-cli.jar`
* `client/` – React frontend
* `jslt/` – source code for the JSLT library (only needed if you want to build the CLI yourself)

## Install dependencies

Install the Node dependencies for both the server and client:

```bash
cd server
npm install
cd ../client
npm install
cd ..
```

The backend already contains a ready-to-use `jslt-cli.jar`. If you prefer building the jar yourself, run:

```bash
cd jslt
./gradlew :core:shadowJar
cp core/build/libs/jslt-*-all.jar ../server/jslt-cli.jar
cd ..
```

## Start the backend

By default the React app proxies API requests to `http://localhost:5001`, so start the server on that port:

```bash
cd server
PORT=5001 npm start
```

The server will print `JSLT server listening on port 5001` and stay running.

## Start the frontend

Open a new terminal and run:

```bash
cd client
npm start
```

The React development server will launch on <http://localhost:3000>. When you open this URL in your browser you should see the JSLT playground.
For full functionality we recommend running the playground in Google Chrome because some features depend on browser APIs that may not be available in other browsers.

Any changes made in `client/src` will hot reload automatically. The frontend sends transformations to the backend at `/api/transform` which executes your JSLT against the provided JSON input.

## Summary

After completing the steps above you will have a local instance of the JSLT playground running with:

* **Frontend:** <http://localhost:3000>
* **Backend:** <http://localhost:5001>

Happy transforming!

