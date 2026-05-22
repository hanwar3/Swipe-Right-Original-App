# SwipeRight - Credit Card Cash Back Optimizer

SwipeRight is a smart credit card recommendation app that helps users maximize their cashback rewards by suggesting the best credit card for every purchase.

## 🚀 Features

- **Smart Recommendations**: AI-powered suggestions for the best credit card based on spending categories
- **Card Portfolio Management**: Track and manage all your credit cards in one place
- **Cashback Optimization**: Maximize your rewards with intelligent spending strategies
- **Merchant Offers**: Discover and activate special cashback offers from merchants
- **AI Chat Support**: Get personalized advice on credit card optimization

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Backend**: Encore.dev (Go-based backend framework)
- **Database**: PostgreSQL with migrations
- **Authentication**: JWT-based auth with OAuth support (Google/Apple)
- **UI Components**: Radix UI components with custom styling

## 📱 App Preview

The app features a modern, responsive design with:

- Clean, gradient-based design using teal and green colors
- Mobile-first responsive layout
- Interactive credit card showcase
- Smooth hover animations and transitions
- Professional typography and spacing

## 🚀 Quick Start

### Option 1: View Demo (Recommended for quick preview)

1. Open `frontend/demo.html` in your web browser
2. This shows the complete app interface without requiring backend setup

### Option 2: Full Development Setup

#### Prerequisites
- Node.js 18+ or Bun
- PostgreSQL database
- Encore.dev CLI (for backend)

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

#### Backend Setup
```bash
cd backend
# Install Encore.dev CLI first
go install encore.dev@latest

# Run the backend
encore run
```

## 🔧 Issues Fixed

The following issues were identified and resolved:

1. **Missing Environment Variables**: Added default backend URL configuration
2. **Backend Connection Issues**: Created mock client fallback for development
3. **Missing Build Scripts**: Added proper npm scripts for development and building
4. **Path Resolution**: Fixed import path mapping in Vite configuration
5. **TypeScript Configuration**: Ensured proper path aliases and module resolution

## 📁 Project Structure

```
swiperight-credit-card-app-main/
├── frontend/                 # React frontend application
│   ├── components/          # Reusable UI components
│   ├── pages/              # Main application pages
│   ├── contexts/           # React context providers
│   ├── lib/                # Utility functions
│   └── demo.html           # Standalone demo version
├── backend/                 # Encore.dev backend services
│   ├── auth/               # Authentication services
│   ├── cards/              # Credit card management
│   └── ai/                 # AI chat functionality
└── README.md               # This file
```

## 🎯 Key Components

- **Home Page**: Landing page with hero section and feature overview
- **Cards Page**: Browse and search available credit cards
- **Recommendations**: Get personalized card recommendations
- **AI Chat**: Interactive AI assistant for credit card advice
- **User Portfolio**: Manage your personal credit card collection

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- OAuth integration for secure third-party login
- Encrypted data storage
- Secure API endpoints

## 🌟 Demo Features

The demo version includes:
- Complete app interface showcase
- Interactive credit card examples
- Responsive design demonstration
- Feature overview and benefits
- Professional UI/UX design

## 📞 Support

For questions or issues:
1. Check the demo version first
2. Review the code structure
3. Ensure all dependencies are properly installed
4. Check backend service status

## 🚀 Future Enhancements

- Real-time spending tracking
- Advanced AI recommendations
- Mobile app development
- Integration with banking APIs
- Social features and community reviews

---

**SwipeRight** - Your wallet's wingman for maximizing credit card rewards! 💳✨

