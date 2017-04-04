function handleQueryError (error) {
  if (error) {
    console.log(error.sql)
    throw error
  }
}

class PlayerStateWriter {
  constructor (connection, worldTimeOffset, maxInserts = 200) {
    this._connection = connection
    this._maxInserts = 200
    this._rows = []
    this._worldTimeOffset = worldTimeOffset
    this._verbose = false
  }

  setVerbose(v) {
    this._verbose = v
  }

  addPlayerState (playerState) {
    this._rows.push([
      playerState.id, playerState.worldTime.add(this._worldTimeOffset).toNumber(), playerState.power, playerState.speed, playerState.heartrate,
      playerState.cadence, playerState.time, playerState.distance, playerState.climbing, playerState.calories,
      playerState.isForward, Math.round(playerState.heading / 1000), playerState.lean, playerState.x, playerState.altitude,
      playerState.y, playerState.groupId, playerState.rideOns
    ])
    if (this._rows.length >= this._maxInserts) {
      this.flush()
    }
  }

  flush () {
    if (this._rows.length) {
      let q = this._connection.query('INSERT IGNORE INTO live_telemetry (rider_id, msec, power, speed, hr, cad, duration, meters, elevation, mwh,'
        + 'fwd, heading, lean_angle, x, y, z, grp, ride_ons) VALUES ?'
        + ' ON DUPLICATE KEY UPDATE msec=VALUES(msec),power=VALUES(power),speed=VALUES(speed),hr=VALUES(hr),'
        + 'cad=VALUES(cad),duration=VALUES(duration),meters=VALUES(meters),elevation=VALUES(elevation),'
        + 'mwh=VALUES(mwh),fwd=VALUES(fwd),heading=VALUES(heading),lean_angle=VALUES(lean_angle),'
        + 'x=VALUES(x),y=VALUES(y),z=VALUES(z),grp=VALUES(grp),ride_ons=VALUES(ride_ons)', [this._rows], handleQueryError
      )
      if (this._verbose) {
        console.log(q.sql)
      }
      this._rows = []
    }
  }

  purge (time) {
    let q = this._connection.query('DELETE FROM live_telemetry where msec < ?', [time.toNumber()])
    if (this._verbose) {
      console.log(q.sql)
    }
  }
}

module.exports = PlayerStateWriter