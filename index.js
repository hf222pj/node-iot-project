const appSettings = require('node-app-settings');
const mqtt = require("async-mqtt");
const { v4 } = require('uuid');
const axios = require('axios');
const https = require('https');
const { exec } = require('child_process');

const config = appSettings.create('settings.json', 'JSON').config;

let servers = [];

const TEMP_MAX = 40;
const HUM_MIN = 30;
const HUM_MAX = 60;

(async () => {
    const client = await mqtt.connectAsync(config.mqttBrokerAddress);

    setInterval(()=>{
        //Check the main server parameter
        //Define if server is operating normally
        // status = ('normal', 'error')
        let status = 'normal'

        client.publish("server", JSON.stringify({server: config.serverName, status: status, msgId:v4()}));
    }, 3000)

    console.log("Connected to ", config.mqttBrokerAddress)
    await client.subscribe("servers")

    if(config.serverRole == "master"){
        await client.subscribe("temperature")
        await client.subscribe("servers")
    }
    client.on("message", function (topic, message) {
        // message is Buffer
        let msg = JSON.parse(message.toString())

        if(topic == "temperature"){
            // Create an instance of the https agent with rejectUnauthorized set to false
            const agent = new https.Agent({ rejectUnauthorized: false });

            console.log(`Storing temperature record on Behind.ai: ${msg.temperature}`)
            const url_temp = config.databaseAPIEndpoint + `/monitor/10/record/add?alias=iot.temperature.minutely&value=${msg.temperature}`
            // Axios request with the agent
            axios.get(url_temp, { httpsAgent: agent });

            console.log(`Storing humidity record on Behind.ai: ${msg.humidity}`)
            const url_humidity = config.databaseAPIEndpoint + `/monitor/10/record/add?alias=iot.humidity.minutely&value=${msg.humidity}`
            // Axios request with the agent
            axios.get(url_humidity, { httpsAgent: agent });

            //In case if temperature
            if(parseFloat(msg.temperature)>TEMP_MAX || parseFloat(msg.humidity) < HUM_MIN || parseFloat(msg.humidity) > HUM_MAX){
                servers.forEach((s)=>{
                    client.publish("servers", JSON.stringify({command: "shutdown", server: s, msgId:v4()}));
                })
            }
        }

        if(topic == "servers"){
            console.log(`Command for the local machine has been received: ${msg.command}`)
            if(msg.server == config.serverName){
                // Execute the shutdown command to halt the machine
                if(msg.command == 'shutdown'){
                    exec('shutdown -h now', (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error: ${error.message}`);
                            return;
                        }
                        console.log(`Shutdown command executed successfully.`);
                    });
                }

                if(msg.command == 'restart'){
                    exec('shutdown -r now', (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error: ${error.message}`);
                            return;
                        }
                        console.log(`Shutdown command executed successfully.`);
                    });
                }
            }
        }

        if(topic == "server"){
            if(servers.indexOf(msg.server) == -1){
                servers.push(msg.server)
            }
        }
    });

})();


