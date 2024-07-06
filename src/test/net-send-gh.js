const net = require('net')

function send(socket, packet){
    return new Promise((resolve, reject) => {
        if( !socket ){
            reject("No Socket available")
        }

        socket.write(packet)

        socket.on('data', (data) => {
            resolve(data.toString())
        })

        socket.on('error', (error) => {
            reject(error)
        })
    })

}

const socket = new net.Socket()

let connectTo = { host: '127.0.0.1', port: 9090}

socket.connect(connectTo, async () => {
    console.log("Connecting to " + connectTo.host)
    console.log("Send test JSON to GoldHEN")

    let packet = {
        // url: "http://192.168.175.251:8799/Users/gkiokan/Shared/jDownloader/hb/apollo.pkg",        
        id: "EP4064-CUSA16261_00-BLASPHEMOUS00000",
        contentUrl: "http://192.168.236.251:8337/dragged/Blasphemous_CUSA16261_A0105_BACKPORT_5.05_OPOISSO893.pkg",
        iconPath: "http://192.168.236.251:8337/dragged/Blasphemous_CUSA16261_A0105_BACKPORT_5.05_OPOISSO893.pkg/icon0.png",
        contentName: "Blasphemous"                  
    }

    console.log("Content", packet)
    
    let data = await send(socket, JSON.stringify(packet))

    console.log({ data })

    // socket.end()
})

socket.on('error', (err) => {
    console.log(err)
})