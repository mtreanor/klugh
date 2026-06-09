export class SensorProvenance {
  constructor(sensorName, resolvedArgs, result, detail, value = null) {
    this.type         = 'sensor';
    this.sensorName   = sensorName;
    this.resolvedArgs = resolvedArgs;
    this.result       = result;
    this.detail       = detail;
    this.value        = value;  // numeric value for sensor-numeric predicates; null for boolean
  }
}
