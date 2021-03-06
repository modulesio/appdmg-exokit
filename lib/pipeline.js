'use strict'

const EventEmitter = require('events').EventEmitter

class Pipeline extends EventEmitter {
  constructor () {
    super()

    this.steps = []
    this.totalSteps = 0
    this.currentStep = 0

    this.cleanupList = []
    this.cleanupStore = {}
  }

  _progress (obj) {
    obj.current = this.currentStep
    obj.total = this.totalSteps

    this.emit('progress', obj)
  }

  _runStep (step, nextAction, cb) {
    const next = (err) => {
      if (err) {
        this._progress({ type: 'step-end', status: 'error' })
        this.hasErrored = true
        this.runRemainingCleanups(function (err2) {
          if (err2) console.error(err2)
          cb(err)
        })
      } else {
        this._progress({ type: 'step-end', status: 'ok' })
        this[nextAction](cb)
      }
    }

    next.skip = () => {
      this._progress({ type: 'step-end', status: 'skip' })
      this[nextAction](cb)
    }

    this.currentStep++
    this._progress({ type: 'step-begin', title: step.title })
    step.fn(next)
  }

  addStep (title, fn) {
    this.totalSteps++
    this.steps.push({ title: title, fn: fn })
  }

  addCleanupStep (id, title, fn) {
    this.cleanupList.push(id)
    this.cleanupStore[id] = { title: title, fn: fn }
  }

  expectAdditional (n) {
    this.totalSteps += n
  }

  runCleanup (id, cb) {
    const fn = this.cleanupStore[id].fn
    const idx = this.cleanupList.indexOf(id)

    if (idx === -1) throw new Error(`No step with id: ${id}`)

    delete this.cleanupStore[id]
    this.cleanupList.splice(idx, 1)

    return fn(cb, this.hasErrored)
  }

  runRemainingCleanups (cb) {
    if (this.cleanupList.length === 0) return cb(null)

    const idx = this.cleanupList.length - 1
    const id = this.cleanupList[idx]

    const step = {
      title: this.cleanupStore[id].title,
      fn: (cb) => this.runCleanup(id, cb)
    }

    this._runStep(step, 'runRemainingCleanups', cb)
  }

  _run (cb) {
    if (this.steps.length === 0) return this.runRemainingCleanups(cb)

    const step = this.steps.shift()

    this._runStep(step, '_run', cb)
  }

  run () {
    process.nextTick(() => {
      this._run((err) => {
        if (err) {
          this.emit('error', err)
        } else {
          this.emit('finish')
        }
      })
    })

    return this
  }
}

module.exports = Pipeline
