import React from 'react';
import { createRoot } from 'react-dom/client';
import StudyTechApp from './StudyTechApp.jsx';
import AuthGate from './AuthGate.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<AuthGate><StudyTechApp /></AuthGate>);
