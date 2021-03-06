// three.js
import * as THREE from 'three'
import { Vector3, Quaternion, Euler } from 'three'
import { Kite, kiteProp, AttachmentPointState} from "./kite"
import { Key, updateDescriptionUI, Pause, PID, Cost } from './util'
import { Tether, tetherProperties, TetherProperties } from './tether'
import { PathFollow } from './pathFollow'

import * as OrbitControlsLibrary from 'three-orbit-controls'
let OrbitControls = OrbitControlsLibrary(THREE)

import { mcAttitude, MCAttitude } from './mcAttitude'
import { mcPosition, MCPosition } from './mcPosition'
import { FWAttitude } from './fwAttitude'
import { VTOL } from './vtol'

import { FlightModeController, FlightMode } from './flightModeController'

import dat from 'dat-gui'

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

let renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'view3d'

document.body.appendChild(renderer.domElement);

// Orbiting controls in using mouse/trackpad
let controls:THREE.OrbitControls = new OrbitControls(camera, renderer.domElement)
controls.enableKeys = false
controls.target.add(new Vector3(70, 20, 0))
camera.position.x = -30;
camera.position.y = 10;
camera.position.z = -5;
controls.update()

// Scene light
setupLights()

// Kite 
let kite = new Kite(kiteProp)
kite.obj.add(new THREE.AxisHelper(2))
kite.obj.rotateX(Math.PI / 2 )
positionKiteAtTheEndOfTether(tetherProperties)
scene.add(kite.obj)

// Tether 
let tether = new Tether(tetherProperties, kite.getAttachmentPointsState())
tether.renderObjects.forEach(mesh => { scene.add( mesh ) })
scene.add( tether.lineMain )
scene.add( tether.lineKite )

var flightModeController = new FlightModeController(kite, scene)
setUpListener(81, flightModeController.toggleMode, flightModeController)


// Visual helpers
let helper = new THREE.GridHelper(25, 25, 0x0000ff, 0x808080)
scene.add(new THREE.AxisHelper(1))
scene.add(helper)

// Pause
let pause = new Pause()

// Cost Counter
let cost = new Cost()
setUpListener(67, function() { // c
    console.log(cost.mean())
}, window)

// start rendering scene and setup callback for each frame
let lastTime: number

function render(ms: number) {
    // we get passed a timestamp in milliseconds
    if (lastTime) {
        update((ms-lastTime)/1000) // call update and pass delta time in seconds
    }

    lastTime = ms
    requestAnimationFrame(render)
    renderer.render( scene, camera )
}

// Main update loop which is run on every frame 
function update(dt: number) {
    if (pause.on) return

    dt = dt // can be used for adjusting the animation speed
    dt = Math.min(dt, 0.03) // max timestep of 0.03 seconds

    detectUserInput(dt) // detect any keypresses and update accordinly

    // increase the amount of numerical integrations for each frame. 
    // Especially increase the stability of the tether calculations
    var subFrameIterations = 20 
    let dtSub = dt/subFrameIterations

    for (var k = 0; k < subFrameIterations; k++) {
        tether.updateTetherPositionAndForces(dtSub)

        flightModeController.update(dtSub) // with sideeffects. 
        let moment = flightModeController.getMoment(dtSub)
                    
        kite.updateKitePositionAndForces(dtSub, tether.kiteTetherForces(), tether.getKiteTetherMass(), moment)
        tether.updateKiteTetherState(kite.getAttachmentPointsState())
    }

    flightModeController.adjustThrust(dt)
    flightModeController.autoAdjustMode()

    // update cost
    cost.add(flightModeController.pf.getCost(kite.obj.position))

    // Set the position of the boxes showing the tether.
    tether.renderObjects.forEach( (mesh, i) => {
        mesh.position.set(tether.pos[i].x, tether.pos[i].y, tether.pos[i].z)
    })
    tether.updateLinePosition()

    updateDescriptionUI(kite, flightModeController.pf)

    // plotting
    let rudderAngle = new Euler().setFromQuaternion(kite.rudder.mesh.quaternion, 'XYZ').x * 180/Math.PI // degrees
    slidingGraph.update((rudderAngle + 20) / 40 )
}

function setupLights() {
    var hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6)
    hemiLight.color.setHSL(0.6, 1, 0.6)
    hemiLight.groundColor.setHSL(0.095, 1, 0.75)
    hemiLight.position.set(0, 500, 0)
    scene.add(hemiLight)
    
    var dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.color.setHSL(0.1, 1, 0.95)
    dirLight.position.set(20, 100, 0)
    dirLight.position.multiplyScalar(50)
    scene.add(dirLight)
}

function detectUserInput(dt: number) {
    var rotationRate = Math.PI // rad / s
    var thrustRate = 20 // N / s

    if (Key.isDown(Key.UP)) kite.elevator.mesh.rotateZ(-rotationRate * dt)
    if (Key.isDown(Key.LEFT)) kite.rudder.mesh.rotateZ(-rotationRate * dt)
    if (Key.isDown(Key.DOWN)) kite.elevator.mesh.rotateZ(rotationRate * dt)
    if (Key.isDown(Key.RIGHT)) kite.rudder.mesh.rotateZ(rotationRate * dt)
    if (Key.isDown(Key.S)) kite.obj.rotateZ(-rotationRate / 4 * dt)
    if (Key.isDown(Key.X)) kite.obj.rotateZ(rotationRate / 4 * dt)
    if (Key.isDown(Key.A)) kite.adjustThrustBy(-thrustRate * dt)
    if (Key.isDown(Key.Z)) kite.adjustThrustBy( thrustRate * dt)
}

function exportState() {

    let state = {
            kite: kite.getState(),
            tether: tether.getState(),
            fmc: flightModeController.getState()
        }
    
    console.log(state)
    console.log(JSON.stringify(state))

}
setUpListener( 69, exportState, this) // e

function loadState() {
    let stateJSONup = '{"kite":{"pos":{"x":60.03775805577096,"y":40.90853733407937,"z":-18.05279448304363},"ori":{"_x":-0.6696006928397035,"_y":-0.37373678909234215,"_z":-0.2058052122755266,"_w":-0.6079473161613373},"vel":{"x":-11.747155790336398,"y":20.27628150275477,"z":8.75823791866575},"angVel":{"x":0.8808647767262232,"y":0.2686194802661194,"z":0.31271172607098446}},"tether":{"pos":[{"x":6.273984999771891,"y":3.1421931462990713,"z":-1.824031570714024},{"x":12.521354706115464,"y":6.335022503140902,"z":-3.6525305102188392},{"x":18.728205650422066,"y":9.605075529364077,"z":-5.483430119262401},{"x":24.874729850932365,"y":12.987670444536878,"z":-7.314148834659466},{"x":30.934605408135987,"y":16.526363110693236,"z":-9.139366746526877},{"x":36.87359675264669,"y":20.27229767095131,"z":-10.949076878192255},{"x":42.64662074128095,"y":24.28376120072181,"z":-12.72746892657013},{"x":48.19323210833012,"y":28.625927834615133,"z":-14.450337034013302},{"x":53.43306660572903,"y":33.36813238239815,"z":-16.07862791075203},{"x":58.266436049359996,"y":38.57216810661956,"z":-17.549912901903625},{"x":60.212948016816355,"y":40.92152811152772,"z":-17.37519599038724},{"x":59.86256809472556,"y":40.89554655663102,"z":-18.73039297570002}],"vel":[{"x":-1.0018624845115196,"y":1.9874434773953809,"z":0.12409258306648985},{"x":-2.031381747992932,"y":3.988439511202589,"z":0.24651153982882276},{"x":-3.0926880329808375,"y":6.007131464947556,"z":0.400293052934043},{"x":-4.185399952559183,"y":8.04484119486734,"z":0.6436958916238423},{"x":-5.302981946168374,"y":10.083179038574535,"z":1.0334427280086467},{"x":-6.4390309338226945,"y":12.092939771094244,"z":1.615603139709557},{"x":-7.606010202645387,"y":14.072529989752818,"z":2.4464138822898596},{"x":-8.842978389427442,"y":16.05587152262789,"z":3.621614275608803},{"x":-10.157313032771501,"y":18.022313186030907,"z":5.286289016765916},{"x":-11.398393576786065,"y":19.766505018559123,"z":7.565644536750749},{"x":-11.436213679508102,"y":19.704781524166123,"z":8.688801950670378},{"x":-12.058097901164695,"y":20.847781481343418,"z":8.827673886661124}]},"fmc":{"pf":{"index":28}}}'
    function reciever(key: string, v: any) {
        if (v instanceof Object && "x" in v && "y" in v && "z" in v) {
            return new Vector3(v.x, v.y, v.z)
        }
        if (v instanceof Object && "_x" in v && "_y" in v && "_z" in v && "_w" in v) {
            return new Quaternion(v._x, v._y, v._z, v._w)
        }
        return v
    }
    let state = JSON.parse(stateJSONup, reciever)
    kite.setState(state.kite)
    tether.setState(state.tether)
    flightModeController.setState(state.fmc)
    flightModeController.mode = FlightMode.PathFollow
    flightModeController.fwAttitude.reset()
    cost.reset()
}

setUpListener( 76, loadState, this) // l

function positionKiteAtTheEndOfTether(tp: TetherProperties) {
    let dx = Math.sqrt(tp.kiteTLength*tp.kiteTLength - kite.tetherAttachmentPoint1.y*kite.tetherAttachmentPoint1.y)
    kite.obj.position.add( new THREE.Vector3(tp.totalLength + dx, 0, 0) )
}

function setUpListener(keyCode: number, action: () => void, caller: Object) {
    document.addEventListener('keydown', function (e) {
        var key = e.keyCode || e.which;
        if (key === keyCode) { // 81 q
            action.call(caller)
        }
    }, false);
}


// console.log(dat)

var gui = new dat.GUI()
gui.add(flightModeController, 'velocitySp', 10, 35)
let rrpid = gui.addFolder("rollRate PID")

rrpid.add(flightModeController.fwAttitude.rollPID, 'p', 0, 30)
rrpid.add(flightModeController.fwAttitude.rollPID, 'i', 0, 1)
rrpid.add(flightModeController.fwAttitude.rollPID, 'd', 0, 1)
rrpid.add(flightModeController.fwAttitude.rollPID, 'ff', -2, 2)

gui.add(flightModeController.pf, 'lookAheadRatio', 0, 1)


class SlidingGraph {
    ctx: CanvasRenderingContext2D
    data: number[] = []

    constructor(readonly canvas: HTMLCanvasElement) {
        this.ctx=canvas.getContext("2d");
        this.ctx.fillStyle = "rgba(255, 0, 255, 1)"
    }

    update(value: number) {
        value = (1-value) * this.canvas.height

        this.data.push(value)

        this.ctx.clearRect(0,0,this.canvas.width, this.canvas.height)

        for (var index = 0; index < this.data.length; index++) {
            this.ctx.fillRect(index,this.data[index],1,1)
        }

        if (this.data.length == this.canvas.width) {
            this.data.shift()
        } 

    }
}

let canvasElement = document.getElementById("canvas") as HTMLCanvasElement

let slidingGraph = new SlidingGraph(canvasElement)



render(null) // start 