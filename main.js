const PlayerStateWriter = require('./src/playerStateWriter')
const mysql = require('mysql')
const program = require('commander')
const Cap = require('cap').Cap, decoders=require('cap').decoders, PROTOCOL=decoders.PROTOCOL
const ZwiftAccount = require('zwift-mobile-api')
const zwiftProtoRoot = ZwiftAccount.getZwiftProtocolRoot()
const clientToServerPacket = zwiftProtoRoot.lookup('ClientToServer')
const serverToClientPacket = zwiftProtoRoot.lookup('ServerToClient')
const Long = require('long')
const buffer = new Buffer(65535)
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

function processPacket(nbytes, trunc) {
  if (linkType === 'ETHERNET') {
    let ret = decoders.Ethernet(buffer)

    if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
      ret = decoders.IPV4(buffer, ret.offset)
      if (ret.info.protocol === PROTOCOL.IP.UDP) {
        ret = decoders.UDP(buffer, ret.offset)
        try {
          if (ret.info.srcport === 3022) {
            let packet = serverToClientPacket.decode(buffer.slice(ret.offset, ret.offset + ret.info.length))
            for (player_state of packet.player_states) {
              if (playerStateWriter) {
                playerStateWriter.addPlayerState(ZwiftAccount.wrappedStatus(player_state))
                numPlayerStates++
              }
            }
            if (packet.num_msgs == packet.msgnum) {
              playerStateWriter.flush()
            }
            if (packet.world_time.greaterThanOrEqual(lastPurgeTime.add(1000))) {
              playerStateWriter.purge(packet.world_time.add(worldTimeOffset).add(-10000))
            }
            let now = new Date()
            if (now - lastStatTime >= 10000) {
              totalNumPlayerStates += numPlayerStates
              console.log(`${(now - startTime) / 1000}s: ${totalNumPlayerStates} total updates ${totalNumPlayerStates * 1000 / (now - startTime)}/s`
                + ` ${(now - lastStatTime) / 1000}s elapsed since last ${numPlayerStates} updates ${numPlayerStates * 1000 / (now - lastStatTime)}/s`)
              numPlayerStates = 0
              lastStatTime = now
            }
          } else if (ret.info.dstport === 3022) {
            let packet = clientToServerPacket.decode(buffer.slice(ret.offset, ret.offset + ret.info.length - 4))
          }
        } catch (ex) {
          console.log(ex)
        }
      }
    }
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

const c = new Cap()
const linkType = c.open(program.interface, filter='port 3022', 10 * 1024 * 1024, buffer)
c.setMinBytes && c.setMinBytes(0)

connection.connect()
riders = account.getWorld().riders().then(riders => {
  worldTimeOffset = (Number(riders.currentDateTime) * 1000) - Number(riders.currentWorldTime)
  playerStateWriter = new PlayerStateWriter(connection, worldTimeOffset)
  c.on('packet', processPacket)
  console.log('Monitoring network traffic.')
}).catch(error => {
  console.log(error)
})

