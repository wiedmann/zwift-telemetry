const PlayerStateWriter = require('./src/playerStateWriter')
const ZwiftPacketMonitor = require('./src/ZwiftPacketMonitor')
const mysql = require('mysql')
const program = require('commander')
const Cap = require('cap').Cap, decoders=require('cap').decoders, PROTOCOL=decoders.PROTOCOL
const ZwiftAccount = require('zwift-mobile-api')
const Long = require('long')
const {wrappedStatus} = require('zwift-mobile-api/src/riderStatus')
let playerStateWriter = null
let worldTimeOffset = 0

program
  .version('0.1.0')
  .option('-u, --user <zwiftuser>', 'zwift user to log in with')
  .option('-p, --password <password>', 'zwift password to log in with')
  .option('-D, --mysql_database <db>', 'mysql database to connect to')
  .option('-H, --mysql_host <host>', 'mysql host to connect to')
  .option('-U, --mysql_user <user>', 'mysql user name')
  .option('-P, --mysql_password <password>', 'mysql password')
  .option('-I, --interface <interface>', 'interface to monitor')
  .option('-l, --list_interfaces', 'list available interfaces and exit')
  .option('-v, --verbose', 'turn on verbose mode')
  .parse(process.argv)

const account = new ZwiftAccount(program.user, program.password)


const connection = mysql.createConnection({
  host: program.mysql_host,
  user: program.mysql_user,
  password: program.mysql_password,
  database: program.mysql_database,
  charset: 'utf8mb4',
  timezone: 'Z',

})

function processChalkLine (error, results, fields) {
  if (error) throw error
  for (var result of results) {
    console.log(JSON.stringify(result))
  }
}

function listDevices () {
  for (var device of Cap.deviceList()) {
    console.log(`${device.name} ${device.description} ${device.addresses[0].addr}`)
  }
}

let lastPurgeTime = new Long(0)
let lastStatTime = new Date()
let startTime = lastStatTime
let totalNumPlayerStates = 0
let numPlayerStates = 0
let zpm = null

function processPlayerState (playerState, serverWorldTime) {
  if (playerStateWriter) {
    playerStateWriter.addPlayerState(wrappedStatus(playerState))
    numPlayerStates++
  }
  if (serverWorldTime.greaterThanOrEqual(lastPurgeTime.add(1000))) {
    playerStateWriter.purge(serverWorldTime.add(worldTimeOffset).add(-10000))
  }
  let now = new Date()
  if (now - lastStatTime >= 10000) {
    totalNumPlayerStates += numPlayerStates
    console.log(`${(now - startTime) / 1000}s: ${totalNumPlayerStates} total updates ${totalNumPlayerStates * 1000 / (now - startTime)}/s`
      + ` ${(now - lastStatTime) / 1000}s elapsed since last ${numPlayerStates} updates ${numPlayerStates * 1000 / (now - lastStatTime)}/s`)
    numPlayerStates = 0
    lastStatTime = now
  }
}

function handleMysqlError(err) {
  if (err.fatal) {
    console.log(`Mysql error (${err.code}) - reconnecting`)
    connection.connect()
  }
}

if (program.list_interfaces) {
  listDevices()
  return
}

connection.connect()
riders = account.getWorld().riders().then(riders => {
  worldTimeOffset = (Number(riders.currentDateTime) * 1000) - Number(riders.currentWorldTime)
  playerStateWriter = new PlayerStateWriter(connection, worldTimeOffset)
  zpm = new ZwiftPacketMonitor(program.interface)
  zpm.on('incomingPlayerState', processPlayerState)
  zpm.on('endOfBatch', () => {playerStateWriter.flush()})
  zpm.start()
  console.log('Monitoring network traffic.')
}).catch(error => {
  console.log(error)
})

