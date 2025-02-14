<template>
<div>
    <h2>Server Application </h2>

    <el-tabs v-model="tab">
      <el-tab-pane label="Log" name="logs">
          <Logs />
      </el-tab-pane>
      <el-tab-pane label="Serving Files" name="serverFiles">
          <Files type="server" />
      </el-tab-pane>
      <el-tab-pane label="Dragged Files" name="draggedFiles">
          <Files type="dragged" />
      </el-tab-pane>      
      <el-tab-pane label="Routes" name="routes">
          <Routes />
      </el-tab-pane>
      <el-tab-pane label="Debug" name="debug">
          <Debug @startServer="startServer" @stopServer="stopServer" @restartServer="restartServer" @hearthbeat="checkHeathbeat" />
      </el-tab-pane>
    </el-tabs>

</div>
</template>

<script>
import fs from 'fs'
import path from 'path'
import { get, sync } from 'vuex-pathify'
import { shell, ipcRenderer } from 'electron'

import express from 'express'
import http from 'http'

import Logs from './components/Logs'
import Files from './components/Files'
import Debug from './components/Debug'
import Routes from './components/Routes'
import { getPs4PkgInfo } from "@njzy/ps4-pkg-info"

export default {
    name: 'Server',

    components: {
        Logs,
        Files,
        Debug,
        Routes,
    },

    data(){ return {
        tab: 'logs',
        run: 0,
        host: {
            app: null,
            server: null,
            router: null,
        }
    }},

    mounted(){
        this.registerChannel()

        this.$store.dispatch('server/resetLogs')
        this.$store.dispatch('server/setServerFiles', [])

        this.loadBasePathFiles()
        this.createServer()
        this.startServer()
    },

    computed: {
        config: get('app'),
        base_path: get('app/server.base_path'),
        ip: get('app/server.ip'),
        port: get('app/server.port'),
        draggedFiles: get('server/draggedFiles'),
        draggedServingFiles: get('server/draggedServingFiles'),
        serverFiles: get('server/serverFiles'),        
        servingFiles: get('server/servingFiles'),
        status: sync('server/status'),
        app: get('server/app'),
        hb(){
            return 'http://' + this.ip + ':' + this.port + '/hb'
        }
    },

    watch: {
        // 'base_path'(){
        //     this.addFilesFromBasePath()
        // },

        'serverFiles'(o, n){
            console.log("::server | serverFiles changed", this.run, o, n)
            this.run++
            if(this.run <=2){
                return
            }
            this.$store.dispatch('server/addLog', "Server files has been changed. Reload files.")
            this.createPaths()
        },

        'draggedFiles'(o,n){
            console.log("::server | draggedFiles changed")
            this.$store.dispatch('server/addLog', "Dragged files has been changed. Reload files.")
            this.createPaths()
        }
    },

    methods: {
        registerChannel(){
            ipcRenderer.on('server', (event, data) => {
                console.log("ipc channel | server ", data)                

                if(data == 'refresh')
                  this.restartServer()

                if(data == 'start')
                  this.startServer()

                if(data == 'stop')
                  this.stopServer()

                if(data == 'toggle'){
                    if(this.status == 'running')
                      this.stopServer()
                    else
                      this.startServer()
                }
            })
        },

        loadBasePathFiles(){
            if(this.config.server.auto_scan_on_startup)
              this.$store.dispatch('server/loadFiles', this.config.server.base_path)
        },

        createServer(){
            const app = express();
            // const server = http.createServer(app);

            this.host.app = app
            this.host.router = express.Router()
            // this.host.server = server
            this.$store.dispatch('server/addLog', "Created Server and Router")
        },

        restartServer(){
            this.$root.sendMain("Restarting Server")
            this.stopServer()
            this.startServer()
        },

        async startServer(){
            // console.log(this.ip, this.ip.length, this.port, this.port.length)
            if(this.ip.length == 0 || this.port.length == 0){
                let error = "Server cannot start. Please configure IP and Port"
                this.$store.dispatch('server/addLog', error)
                this.$root.sendMain(error)
                // this.$message({ type: 'warning', message: error });
                return
            }

            this.host.server = await this.host.app.listen(this.port, () => {
                this.$store.dispatch('server/addLog', 'Server is running on port ' + this.ip + ' at port ' + this.port)
                this.$store.dispatch('server/setStatus', 'running')
                this.addCORSHandler()
                this.addRouterMiddleware()
                this.createPaths()
            })
            .on('error', (e) => {
                // console.log({ ...e })
                if(e.errno === 'EADDRINUSE'){
                  let error = "Port " + this.port + " is already in use. Choose another Port and restart the Server"
                  this.$root.sendMain(error)
                  this.$store.dispatch('server/addLog', error)
                }
                else {
                  this.$root.sendMain(e)
                  this.$store.dispatch('server/addLog', 'Error in listening on ' + this.ip + ' at port ' + this.port + ". Error: " + e.errno)
                }

                this.$store.dispatch('server/setStatus', 'error')
            })
        },

        async stopServer(){
            let log = 'Closing Server'
            this.$store.dispatch('server/addLog', log)

            if(this.host.server)
              await this.host.server.close(() => {
                  this.$store.dispatch('server/addLog', 'Server closed')
                  this.$store.dispatch('server/setStatus', 'stopped')
              })
            else
              this.$store.dispatch('server/addLog', "Server can not be closed. Server Object does't exist")
        },

        addCORSHandler(){
            this.host.app.use((req, res, next) => {
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
                // res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
                // res.setHeader('Access-Control-Allow-Credentials', true);
                next()
            })
        },

        addRouterMiddleware(){
            this.host.app.use((req, res, next) => {
                this.host.router(req, res, next)
            })
        },

        createPaths(){
            this.host.router = new express.Router()
            this.$store.dispatch('server/setRoutes', [])
            this.addHearthbeatEndpoint()
            this.addFilesFromBasePath()
            this.addDraggedFilesToServer()
            this.$store.dispatch('server/setRoutes', this.getRegisteredRoutes())
        },

        getRegisteredRoutes(){
            return this.host.router.stack.filter(r => r.route).map(r => r.route.path)
        },

        addHearthbeatEndpoint(){
            this.$store.dispatch('server/addLog', "Create Hearthbeat endpoint")
            this.host.router.get('/hb', function(request, response){
                response.status(200).json({
                    remoteAddress: request.connection.remoteAddress,
                    remotePort: request.connection.remotePort,
                    localAddress: request.connection.localAddress,
                    localPort: request.connection.localPort,
                    message: "Congratz. Hearthbeat is working"
                })
            })
        },

        addFilesFromBasePath(){
            this.$store.dispatch('server/addLog', "Reset serving files list")
            let servingFiles = []

            this.$store.dispatch('server/addLog', "Found " + this.serverFiles.length + " files at base path")

            this.serverFiles.map( file => {
                servingFiles.push(this.addFileEndpoint(file))
            })

            this.$store.dispatch('server/addLog', "Serving " + servingFiles.length + " files from base path")
            this.$store.dispatch('server/setServingFiles', servingFiles)            
        },

        addDraggedFilesToServer(){
            // if( this.draggedFiles.length == 0 ){
            //     this.$store.dispatch('server/addLog', "No dragged files found, skipping.")
            //     return
            // }
            
            this.$store.dispatch('server/addLog', "Found " + this.draggedFiles.length + " dragged Files")
            let servingFiles = []

            this.draggedFiles.map( file => {
                file = { ...file, patchedFilename: 'dragged/' + file.patchedFilename }
                servingFiles.push(this.addFileEndpoint(file))
            })

            this.$store.dispatch('server/addLog', "Added " + servingFiles.length + " dragged files to the Server.")
            this.$store.dispatch('server/setDraggedServingFiles', servingFiles)
            console.log(servingFiles)
        },

        addFileEndpoint(file){
            // this.$store.dispatch('server/addLog', "Create endpoint " + file.patchedFilename)
            this.host.router.get(`/${file.patchedFilename}`, function(request, response){
                response.status(200).download(file.path, file.name)
            })

            // add Image callback to file as ${file}/icon0.png
            this.host.router.get(`/${file.patchedFilename}/icon0.png`, async (request, response) => await this.fileImageCallbackResponse(file, request, response) )

            // Validate a couple states
            let inQueue = this.$store.getters['queue/isInQueue'](file)
            let isInstalled = this.$store.getters['queue/isInstalled'](file)

            file.url    = 'http://' + this.ip + ':' + this.port + '/' + file.patchedFilename
            file.image  = file.url + '/icon0.png'
            file.status = 'serving'

            if(inQueue)
              file.status = 'in queue'

            if(isInstalled)
              file.status = 'installed'

            return file
        },

        async fileImageCallbackResponse(file, request, response){
            let image = null
            try {
                let s = await getPs4PkgInfo(file.path, { generateBase64Icon: true })
                    .catch( e => {
                        console.error("Error in PKG Extraction: "+ e + '; File: ' + fileName)
                        throw e
                    })            

                const image = s.icon0Raw;
                response.writeHead(200, { 'Content-Type': 'image/png' });
                response.end(image, 'binary');
            }
            catch (e){
                console.error(e)
                response.status(404).json({
                    error: e,
                    time: (new Date).valueOf()
                })
            }
        },

        checkHeathbeat(){
            this.open(this.hb)
        },

        open(path){
            window.open(path)
        },

    }
}
</script>

<style lang="css" scoped>
</style>
