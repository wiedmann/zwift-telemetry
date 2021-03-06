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
      playerState.isForward, Math.round(playerState.heading / 1000), Math.round(playerState.lean/1000), playerState.x, playerState.altitude,
      playerState.y, playerState.groupId, playerState.rideOns, playerState.roadID, playerState.roadTime, playerState.roadPosition,
      playerState.customisationId, playerState.watchingRiderId, playerState.isTurning, playerState.laps, playerState.sport,
      playerState.progress, playerState.powerup
    ])
    if (this._rows.length >= this._maxInserts) {
      this.flush()
    }
  }

  flush () {
    if (this._rows.length) {
      let q = this._connection.query('INSERT IGNORE INTO live_telemetry (rider_id, msec, power, speed, hr, cad, duration, meters, elevation, mwh,'
        + 'fwd, heading, lean_angle, x, y, z, grp, ride_ons, road_id, road_time, road_position, customisation, watching_rider_id, turning, '
        + 'laps, sport, progress, powerup) VALUES ?'
        + ' ON DUPLICATE KEY UPDATE msec=VALUES(msec),power=VALUES(power),speed=VALUES(speed),hr=VALUES(hr),'
        + 'cad=VALUES(cad),duration=VALUES(duration),meters=VALUES(meters),elevation=VALUES(elevation),'
        + 'mwh=VALUES(mwh),fwd=VALUES(fwd),heading=VALUES(heading),lean_angle=VALUES(lean_angle),'
        + 'x=VALUES(x),y=VALUES(y),z=VALUES(z),grp=VALUES(grp),ride_ons=VALUES(ride_ons),road_position=VALUES(road_position),'
        + 'road_id=VALUES(road_id),road_time=VALUES(road_time),laps=VALUES(laps),customisation=VALUES(customisation),'
        + 'watching_rider_id=VALUES(watching_rider_id),sport=VALUES(sport),progress=VALUES(progress),powerup=VALUES(powerup),turning=VALUES(turning)', [this._rows], handleQueryError
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