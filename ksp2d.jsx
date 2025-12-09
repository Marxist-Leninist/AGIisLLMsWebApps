import React, { useState, useEffect, useCallback, useRef } from 'react';

const PLANET_RADIUS = 200;
const PLANET_MASS = 5e14;
const G = 6.674e-11;
const ATMOSPHERE_HEIGHT = 100;
const SCALE = 1;

export default function KSP2D() {
  const [gameState, setGameState] = useState('launch'); // launch, flying, landed, crashed
  const [rocket, setRocket] = useState({
    x: 0,
    y: PLANET_RADIUS + 20,
    vx: 0,
    vy: 0,
    angle: 0, // radians, 0 = up
    fuel: 100,
    throttle: 0,
  });
  const [camera, setCamera] = useState({ x: 0, y: PLANET_RADIUS + 200, zoom: 1 });
  const [keys, setKeys] = useState({});
  const [trail, setTrail] = useState([]);
  const [time, setTime] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const frameRef = useRef();
  const lastTimeRef = useRef(Date.now());

  const getAltitude = useCallback((x, y) => {
    return Math.sqrt(x * x + y * y) - PLANET_RADIUS;
  }, []);

  const getAtmosphereDensity = useCallback((altitude) => {
    if (altitude < 0) return 1;
    if (altitude > ATMOSPHERE_HEIGHT) return 0;
    return Math.pow(1 - altitude / ATMOSPHERE_HEIGHT, 2);
  }, []);

  const getOrbitalVelocity = useCallback((altitude) => {
    const r = PLANET_RADIUS + altitude;
    return Math.sqrt(G * PLANET_MASS / r);
  }, []);

  const resetGame = () => {
    setRocket({
      x: 0,
      y: PLANET_RADIUS + 20,
      vx: 0,
      vy: 0,
      angle: 0,
      fuel: 100,
      throttle: 0,
    });
    setGameState('launch');
    setTrail([]);
    setTime(0);
    setMaxAltitude(0);
    setCamera({ x: 0, y: PLANET_RADIUS + 200, zoom: 1 });
  };

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'ShiftLeft', 'KeyZ', 'KeyX'].includes(e.code)) {
        e.preventDefault();
        setKeys(k => ({ ...k, [e.code]: true }));
      }
    };
    const handleKeyUp = (e) => {
      setKeys(k => ({ ...k, [e.code]: false }));
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState === 'crashed') return;

    const update = () => {
      const now = Date.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      setRocket(prev => {
        let { x, y, vx, vy, angle, fuel, throttle } = prev;
        
        // Controls
        if (keys.ArrowLeft || keys.KeyA) angle -= 2 * dt;
        if (keys.ArrowRight || keys.KeyD) angle += 2 * dt;
        if (keys.ShiftLeft) throttle = Math.min(1, throttle + dt * 2);
        if (keys.KeyZ) throttle = Math.min(1, throttle + dt * 2);
        if ((keys.ArrowDown || keys.KeyS || keys.KeyX) && throttle > 0) throttle = Math.max(0, throttle - dt * 2);
        if (keys.Space && fuel > 0) throttle = 1;

        const altitude = getAltitude(x, y);
        const distance = Math.sqrt(x * x + y * y);
        
        // Gravity
        const gForce = (G * PLANET_MASS) / (distance * distance);
        const gx = -gForce * (x / distance);
        const gy = -gForce * (y / distance);

        // Thrust
        let thrustForce = 0;
        if (fuel > 0 && throttle > 0 && gameState === 'flying') {
          thrustForce = 50 * throttle;
          fuel = Math.max(0, fuel - throttle * dt * 8);
        }
        const tx = -Math.sin(angle) * thrustForce;
        const ty = Math.cos(angle) * thrustForce;

        // Drag
        const density = getAtmosphereDensity(altitude);
        const speed = Math.sqrt(vx * vx + vy * vy);
        const dragCoeff = 0.01 * density * speed;
        const dx = -vx * dragCoeff;
        const dy = -vy * dragCoeff;

        // Update velocity
        vx += (gx + tx + dx) * dt;
        vy += (gy + ty + dy) * dt;

        // Update position
        x += vx * dt;
        y += vy * dt;

        // Check landing/crash
        const newAltitude = getAltitude(x, y);
        if (newAltitude <= 0) {
          const impactSpeed = Math.sqrt(vx * vx + vy * vy);
          const surfaceAngle = Math.atan2(x, y);
          const angleDiff = Math.abs(angle - surfaceAngle);
          
          if (impactSpeed < 15 && (angleDiff < 0.3 || angleDiff > Math.PI * 2 - 0.3)) {
            setGameState('landed');
            // Place on surface
            const norm = PLANET_RADIUS / Math.sqrt(x * x + y * y);
            x *= norm * 1.01;
            y *= norm * 1.01;
            vx = 0;
            vy = 0;
          } else {
            setGameState('crashed');
          }
        }

        return { x, y, vx, vy, angle, fuel, throttle };
      });

      setTime(t => t + dt);
      
      // Update trail
      setTrail(prev => {
        const newTrail = [...prev, { x: rocket.x, y: rocket.y }];
        return newTrail.slice(-500);
      });

      // Update camera
      setCamera(prev => ({
        x: rocket.x * 0.1 + prev.x * 0.9,
        y: rocket.y * 0.1 + prev.y * 0.9,
        zoom: Math.max(0.3, Math.min(2, 300 / (getAltitude(rocket.x, rocket.y) + 100))),
      }));

      // Update max altitude
      const alt = getAltitude(rocket.x, rocket.y);
      setMaxAltitude(m => Math.max(m, alt));

      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
  }, [keys, gameState, rocket.x, rocket.y, getAltitude, getAtmosphereDensity]);

  // Launch handler
  const handleLaunch = () => {
    setGameState('flying');
  };

  const altitude = getAltitude(rocket.x, rocket.y);
  const speed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
  const orbitalV = getOrbitalVelocity(altitude);
  const periapsis = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
  
  // Calculate orbital elements
  const r = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
  const v = speed;
  const specificEnergy = (v * v / 2) - (G * PLANET_MASS / r);
  const isOrbiting = specificEnergy < 0 && altitude > 10;

  // Transform coordinates for rendering
  const viewWidth = 800;
  const viewHeight = 600;
  const zoom = camera.zoom;
  
  const worldToScreen = (wx, wy) => ({
    x: viewWidth / 2 + (wx - camera.x) * zoom,
    y: viewHeight / 2 - (wy - camera.y) * zoom,
  });

  const planetScreen = worldToScreen(0, 0);
  const rocketScreen = worldToScreen(rocket.x, rocket.y);

  return (
    <div className="w-full h-screen bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="relative" style={{ width: viewWidth, height: viewHeight }}>
        {/* Stars background */}
        <svg className="absolute inset-0" width={viewWidth} height={viewHeight}>
          <defs>
            <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
              <stop offset="70%" stopColor="transparent" />
              <stop offset="100%" stopColor="rgba(100,150,255,0.3)" />
            </radialGradient>
            <radialGradient id="planet" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#4a7c4e" />
              <stop offset="100%" stopColor="#2d4a2f" />
            </radialGradient>
          </defs>
          
          {/* Stars */}
          {Array.from({ length: 100 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 97 + 50) % viewWidth}
              cy={(i * 73 + 30) % viewHeight}
              r={Math.random() * 1.5 + 0.5}
              fill={`rgba(255,255,255,${0.3 + Math.random() * 0.7})`}
            />
          ))}
          
          {/* Atmosphere glow */}
          <circle
            cx={planetScreen.x}
            cy={planetScreen.y}
            r={(PLANET_RADIUS + ATMOSPHERE_HEIGHT) * zoom}
            fill="url(#atmosphere)"
          />
          
          {/* Planet */}
          <circle
            cx={planetScreen.x}
            cy={planetScreen.y}
            r={PLANET_RADIUS * zoom}
            fill="url(#planet)"
            stroke="#5a9c5e"
            strokeWidth={2}
          />
          
          {/* Surface details */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const sx = planetScreen.x + Math.cos(rad) * PLANET_RADIUS * zoom * 0.9;
            const sy = planetScreen.y + Math.sin(rad) * PLANET_RADIUS * zoom * 0.9;
            return (
              <circle
                key={i}
                cx={sx}
                cy={sy}
                r={5 * zoom}
                fill="#3d6340"
              />
            );
          })}
          
          {/* Trail */}
          <polyline
            points={trail.map(p => {
              const s = worldToScreen(p.x, p.y);
              return `${s.x},${s.y}`;
            }).join(' ')}
            fill="none"
            stroke="rgba(255,200,100,0.5)"
            strokeWidth={1}
          />
          
          {/* Rocket */}
          <g transform={`translate(${rocketScreen.x}, ${rocketScreen.y}) rotate(${rocket.angle * 180 / Math.PI})`}>
            {/* Flame */}
            {rocket.throttle > 0 && rocket.fuel > 0 && gameState === 'flying' && (
              <>
                <polygon
                  points={`0,${15 + rocket.throttle * 20} -5,10 5,10`}
                  fill={`rgba(255,${150 + Math.random() * 100},0,0.9)`}
                />
                <polygon
                  points={`0,${10 + rocket.throttle * 12} -3,8 3,8`}
                  fill={`rgba(255,255,${Math.random() * 100},0.9)`}
                />
              </>
            )}
            
            {/* Rocket body */}
            <polygon
              points="-6,10 -6,-5 0,-15 6,-5 6,10"
              fill={gameState === 'crashed' ? '#666' : '#ddd'}
              stroke="#999"
              strokeWidth={1}
            />
            {/* Window */}
            <circle cx={0} cy={-5} r={3} fill="#4af" />
            {/* Fins */}
            <polygon points="-6,10 -12,15 -6,5" fill={gameState === 'crashed' ? '#533' : '#a33'} />
            <polygon points="6,10 12,15 6,5" fill={gameState === 'crashed' ? '#533' : '#a33'} />
          </g>
        </svg>
        
        {/* HUD */}
        <div className="absolute top-4 left-4 text-green-400 font-mono text-sm bg-black/50 p-3 rounded">
          <div className="text-lg font-bold text-green-300 mb-2">FLIGHT DATA</div>
          <div>Altitude: {altitude.toFixed(1)} m</div>
          <div>Speed: {speed.toFixed(1)} m/s</div>
          <div>Orbital Velocity: {orbitalV.toFixed(1)} m/s</div>
          <div className={isOrbiting ? 'text-yellow-400' : ''}>
            Status: {isOrbiting ? '🛰️ ORBITING' : altitude > ATMOSPHERE_HEIGHT ? '🚀 IN SPACE' : '✈️ IN ATMOSPHERE'}
          </div>
          <div className="mt-2">
            <div>Fuel: </div>
            <div className="w-32 h-3 bg-gray-700 rounded">
              <div 
                className={`h-full rounded transition-all ${rocket.fuel < 20 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${rocket.fuel}%` }}
              />
            </div>
          </div>
          <div className="mt-1">
            <div>Throttle: </div>
            <div className="w-32 h-3 bg-gray-700 rounded">
              <div 
                className="h-full bg-orange-500 rounded transition-all"
                style={{ width: `${rocket.throttle * 100}%` }}
              />
            </div>
          </div>
          <div className="mt-2 text-gray-400">
            Max Alt: {maxAltitude.toFixed(0)} m
          </div>
          <div>Time: {time.toFixed(1)}s</div>
        </div>
        
        {/* Controls help */}
        <div className="absolute bottom-4 left-4 text-gray-400 font-mono text-xs bg-black/50 p-2 rounded">
          <div className="text-gray-300 mb-1">CONTROLS</div>
          <div>A/D or ←/→ : Rotate</div>
          <div>SHIFT/Z : Throttle Up</div>
          <div>S/X : Throttle Down</div>
          <div>SPACE : Full Throttle</div>
          <div>R : Reset</div>
        </div>
        
        {/* Navball-style indicator */}
        <div className="absolute bottom-4 right-4 w-24 h-24 rounded-full border-2 border-green-400 bg-black/70 flex items-center justify-center">
          <div 
            className="w-1 h-10 bg-green-400 origin-bottom"
            style={{ transform: `rotate(${rocket.angle * 180 / Math.PI}deg)` }}
          />
          <div className="absolute w-20 h-20 rounded-full border border-green-400/30" />
          <div className="absolute text-green-400 text-xs top-1">N</div>
        </div>
        
        {/* Launch screen */}
        {gameState === 'launch' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-green-400 mb-4">🚀 KERBAL 2D</h1>
            <p className="text-gray-400 mb-6">Launch your rocket into orbit!</p>
            <button
              onClick={handleLaunch}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xl transition-colors"
            >
              LAUNCH!
            </button>
            <div className="mt-8 text-gray-500 text-sm">
              <p>🎯 Goal: Reach orbit (negative orbital energy)</p>
              <p>⚠️ Land gently (&lt;15 m/s, pointing up)</p>
            </div>
          </div>
        )}
        
        {/* Landed screen */}
        {gameState === 'landed' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-green-400 mb-4">🎉 LANDED!</h1>
            <p className="text-gray-300 mb-2">Max Altitude: {maxAltitude.toFixed(0)} m</p>
            <p className="text-gray-300 mb-2">Remaining Fuel: {rocket.fuel.toFixed(0)}%</p>
            <p className="text-gray-300 mb-6">Flight Time: {time.toFixed(1)}s</p>
            <button
              onClick={resetGame}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded"
            >
              FLY AGAIN
            </button>
          </div>
        )}
        
        {/* Crashed screen */}
        {gameState === 'crashed' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-red-500 mb-4">💥 RAPID UNPLANNED DISASSEMBLY</h1>
            <p className="text-gray-300 mb-2">Impact Speed: {speed.toFixed(1)} m/s</p>
            <p className="text-gray-300 mb-6">Max Altitude: {maxAltitude.toFixed(0)} m</p>
            <button
              onClick={resetGame}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
            >
              REVERT TO LAUNCH
            </button>
          </div>
        )}
      </div>
      
      {/* Keyboard listener for R to reset */}
      {keys.KeyR && gameState !== 'launch' && resetGame()}
    </div>
  );
}
