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

let connectTo = { host: '192.168.175.121', port: 9090}

socket.connect(connectTo, async () => {
    console.log("Connecting to " + connectTo.host)
    console.log("Send test JSON to GoldHEN")

    let packet = {
        // url: "http://pkg-zone.com/download/ps4/APOL00004/latest",
        url: "http://192.168.175.251:8799/Users/gkiokan/Shared/jDownloader/hb/apollo.pkg",
    }

    console.log("Content", packet)
    
    let data = await send(socket, JSON.stringify(packet))

    console.log({ data })

    // socket.end()
})

socket.on('error', (err) => {
    console.log(err)
})