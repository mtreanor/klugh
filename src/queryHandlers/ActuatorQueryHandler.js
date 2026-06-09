import { QueryHandler } from '../QueryHandler.js';

export class ActuatorQueryHandler extends QueryHandler {
  constructor() {
    super();
    this._actuators        = new Map();
    this._numericActuators = new Map();
  }

  register(name, actuator) {
    this._actuators.set(name, actuator);
  }

  registerNumeric(name, actuator) {
    this._numericActuators.set(name, actuator);
  }

  fire(name, resolvedArgs, negated, evaluationContext) {
    const actuator = this._actuators.get(name);
    if (!actuator) throw new Error(`No actuator registered for "${name}"`);
    actuator.actuate(resolvedArgs, negated, evaluationContext);
  }

  fireNumeric(name, resolvedArgs, value, operation, evaluationContext) {
    const actuator = this._numericActuators.get(name);
    if (!actuator) throw new Error(`No numeric actuator registered for "${name}"`);
    actuator.apply(resolvedArgs, value, operation, evaluationContext);
  }
}
