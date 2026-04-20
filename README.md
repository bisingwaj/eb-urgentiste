# 🚑 Étoile Bleue - Emergency Responder & Hospital Portal

Welcome to the **Étoile Bleue (Mobile)** repository. This "Mission-Critical" application is designed for First Responders, Emergency Physicians, and Hospital Admissions services. 
It enables real-time interception of emergency alerts, duty status management, and medical intervention tracking.

---

## 🛠 Technology Stack

- **Framework**: React Native with Expo (SDK 54)
- **Navigation**: Expo Router (File-based routing)
- **Backend & Auth**: Supabase (PostgreSQL, Realtime, Edge Functions)
- **Maps & Location**: RNMapbox
- **Communication**: Agora SDK (Live RTC)

---

## 🚀 Getting Started

Setting up the project requires a properly configured mobile development environment.

### 1. Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js (LTS)**: We recommend using NVM to manage Node versions.
- **Java Development Kit (JDK 17+)**: Essential for Android builds. Ensure `java -version` returns a valid version in your terminal.
- **Package Manager**: `npm` (Standard)

### 2. Environment Setup

#### 🍏 macOS (iOS & Android)
- **Xcode**: Required for iOS development. Install via the App Store or download from the [Apple Developer Portal](https://developer.apple.com/download/). Ensure *Command Line Tools* are installed.
- **CocoaPods**: Required for native iOS dependencies (`brew install cocoapods`).

#### 🪟 Windows / 🐧 Linux (Android)
- **Android Studio**: Download and install [Android Studio](https://developer.android.com/studio).
- **Android SDK**: Install the required SDK platforms and build tools via the SDK Manager.
- **Environment Variables**: Configure `ANDROID_HOME` and add the platform-tools to your `PATH`.

### 3. Installation

1. **Clone the repository**:
   ```bash
   git clone git@github.com:bisingwaj/eb-urgentiste.git
   cd eb-urgentiste
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .local.env.example .local.env
   ```
   *Fill in `.local.env` with your Supabase, Mapbox, and Agora credentials.*

---

## 📱 Development & Testing

You can run the application on either a physical device or a virtual emulator.

### Option A: Physical Device (Recommended)
This is the fastest and most reliable way to test hardware features like GPS and Camera.
1. Install the **Expo Go** app on your device ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)).
2. Connect your device and computer to the same Wi-Fi network.
3. Start the project: `npx expo start`
4. Scan the QR code with your device.

### Option B: Virtual Device (Simulator/Emulator)
Use this if you don't have a physical device available.
1. **iOS Simulator**: Open Xcode and start a simulator, then press `i` in the terminal.
2. **Android Emulator**: Open Android Studio, start an AVD (Android Virtual Device), then press `a` in the terminal.

---

## 📂 Documentation Structure

To avoid clutter, documentation is organized into thematic subfolders within the `/docs` directory:

- **/docs/specs**: Technical specifications and architecture overviews.
- **/docs/workflow**: Detailed emergency and responder workflow diagrams.
- **/docs/integration**: Guides for integrating with Hospital systems and external SDKs.
- **/docs/strategy**: Migration plans and project roadmaps.
- **/docs/analysis**: Deep dives into system components and performance.

*For historical context or legacy prompt logs, refer to the subfolders within `docs/` or previous commit history.*

---

Happy coding for **Étoile Bleue**!
