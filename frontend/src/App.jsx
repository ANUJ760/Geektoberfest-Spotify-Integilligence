import React, { useState } from 'react';
import MusicExplorer from './pages/MusicExplorer';
import MusicDashboard from './pages/MusicDashboard';

function App() {
  const [activeTab, setActiveTab] = useState('explorer');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#EFEFEA', margin: 0, padding: 0 }}>
      {/* SWISS EDITORIAL TOP NAVIGATION BAR */}
      <div style={{
        backgroundColor: '#000000',
        padding: '15px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
      }}>
        <div style={{ color: '#FFF', fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>
          SPOTIFY SYSTEM VIEWS //
        </div>
        
        <div style={{ display: 'flex', gap: '20px' }}>
          <button 
            onClick={() => setActiveTab('explorer')}
            style={{
              backgroundColor: activeTab === 'explorer' ? '#D9383A' : '#FFF',
              color: activeTab === 'explorer' ? '#FFF' : '#000',
              border: '1px solid #000',
              padding: '6px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '11px',
              letterSpacing: '1px'
            }}
          >
            01 // MUSIC EXPLORER
          </button>
          
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{
              backgroundColor: activeTab === 'dashboard' ? '#D9383A' : '#FFF',
              color: activeTab === 'dashboard' ? '#FFF' : '#000',
              border: '1px solid #000',
              padding: '6px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '11px',
              letterSpacing: '1px'
            }}
          >
            02 // ANALYTICS DASHBOARD
          </button>
        </div>
      </div>

      {/* COMPONENT VIEWPORT SWITCH */}
      <main style={{ width: '100%' }}>
        {activeTab === 'explorer' ? <MusicExplorer /> : <MusicDashboard />}
      </main>
    </div>
  );
}

export default App;
