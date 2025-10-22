# Google AdSense Setup Guide for Blitz Arena

This guide will help you set up and deploy Google AdSense banner ads in your GameLobby.

## 📋 What Was Implemented

1. **AdBanner Component** (`src/components/AdBanner.js`)
   - Responsive banner ad component
   - Test mode for development
   - Easy toggle on/off via environment variables

2. **Layout Integration** (`src/app/layout.js`)
   - Google AdSense script integration
   - Conditional loading based on environment settings

3. **GameLobby Integration** (`src/components/GameLobby.js`)
   - Banner ad displays at the bottom of the lobby
   - NO ads during gameplay or leaderboard (as requested)

## 🚀 Quick Start

### Development Mode (Test Placeholder)

1. **Update your `.env.local` file** with your existing Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
   NEXT_PUBLIC_API_URL=http://localhost:3001

   # AdSense settings (keep test mode ON for now)
   NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
   NEXT_PUBLIC_ADSENSE_SLOT_ID=XXXXXXXXXX
   NEXT_PUBLIC_ADS_ENABLED=true
   NEXT_PUBLIC_ADS_TEST_MODE=true  # Shows placeholder ad
   ```

2. **Start your development server**:
   ```bash
   cd blitz-arena-frontend
   npm run dev
   ```

3. **View the test ad**:
   - Go to http://localhost:3000
   - Log in to your account
   - You should see a purple-themed placeholder ad at the bottom of the lobby
   - It will say "Advertisement (Test Mode)" with an ad icon

### Production Mode (Real AdSense)

Once you have your AdSense account approved:

1. **Get your AdSense credentials**:
   - Go to https://www.google.com/adsense/
   - Create an ad unit (choose "Display ads" → "Banner")
   - Copy your Client ID (format: `ca-pub-XXXXXXXXXXXXXXXX`)
   - Copy your Ad Slot ID (format: `XXXXXXXXXX`)

2. **Update `.env.local`**:
   ```bash
   NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-1234567890123456  # Your real ID
   NEXT_PUBLIC_ADSENSE_SLOT_ID=9876543210  # Your real slot ID
   NEXT_PUBLIC_ADS_ENABLED=true
   NEXT_PUBLIC_ADS_TEST_MODE=false  # Switch to production mode
   ```

3. **Restart your dev server**:
   ```bash
   npm run dev
   ```

4. **Verify real ads are showing**:
   - The placeholder should be replaced with actual Google ads
   - Ads may take a few minutes to load initially

## 🎨 How It Looks

### Test Mode (Development)
```
┌─────────────────────────────────────────┐
│     Advertisement (Test Mode)           │
│  ┌───────────────────────────────────┐  │
│  │          📢                        │  │
│  │   Ad Space - 728x90 / 320x50      │  │
│  │   Replace with real AdSense when  │  │
│  │           approved                │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Production Mode
```
┌─────────────────────────────────────────┐
│         Advertisement                   │
│  ┌───────────────────────────────────┐  │
│  │   [Google AdSense Banner Ad]      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 📱 Mobile Responsive

The ad automatically adjusts:
- **Mobile**: 320x50 banner (small, non-intrusive)
- **Desktop**: 728x90 leaderboard banner
- **Max height**: 90px to prevent disrupting gameplay

## 🔧 Configuration Options

### Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `NEXT_PUBLIC_ADS_ENABLED` | `true` / `false` | Master switch for all ads |
| `NEXT_PUBLIC_ADS_TEST_MODE` | `true` / `false` | Show placeholder vs real ads |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | `ca-pub-XXXXX` | Your AdSense client ID |
| `NEXT_PUBLIC_ADSENSE_SLOT_ID` | `XXXXXXXXXX` | Your ad unit slot ID |

### Toggle Ads On/Off

**Completely disable ads**:
```bash
NEXT_PUBLIC_ADS_ENABLED=false
```

**Enable test mode only**:
```bash
NEXT_PUBLIC_ADS_ENABLED=true
NEXT_PUBLIC_ADS_TEST_MODE=true
```

**Enable real ads**:
```bash
NEXT_PUBLIC_ADS_ENABLED=true
NEXT_PUBLIC_ADS_TEST_MODE=false
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-your-id
NEXT_PUBLIC_ADSENSE_SLOT_ID=your-slot-id
```

## 🚢 Deployment

### For Production (Vercel, Netlify, etc.)

1. **Add environment variables** in your hosting platform:
   - Go to your project settings
   - Add all `NEXT_PUBLIC_*` variables
   - Set `NEXT_PUBLIC_ADS_TEST_MODE=false`
   - Add your real AdSense IDs

2. **Deploy**:
   ```bash
   npm run build
   npm run start
   ```

3. **Verify**:
   - Visit your live site
   - Check the lobby for ads
   - Confirm NO ads appear during gameplay

## 🧪 Testing Checklist

- [ ] Test mode shows placeholder ad in lobby
- [ ] Ad appears ONLY in lobby (not in gameplay or leaderboard)
- [ ] Ad is responsive on mobile (320x50)
- [ ] Ad is responsive on desktop (728x90)
- [ ] Ad disappears when `NEXT_PUBLIC_ADS_ENABLED=false`
- [ ] Real ads load when test mode is disabled
- [ ] No console errors related to AdSense
- [ ] Page loads quickly (ads don't block render)

## 🎯 Ad Placement Summary

✅ **WHERE ADS APPEAR**:
- GameLobby.js (bottom of page)

❌ **WHERE ADS DO NOT APPEAR**:
- SpeedTicTacToe.js (during gameplay)
- NineMensMorris.js (during gameplay)
- Leaderboard.js
- Login/Auth pages

## 🛠️ Troubleshooting

### Ad not showing in test mode
- Check `NEXT_PUBLIC_ADS_ENABLED=true` in `.env.local`
- Restart your dev server after changing `.env.local`
- Clear browser cache

### Real ads not showing
- Verify AdSense account is approved
- Check Client ID and Slot ID are correct
- AdSense can take 24-48 hours to activate
- Check browser console for errors

### Ads showing during gameplay
- This should NOT happen
- Check that AdBanner is ONLY imported in GameLobby.js
- Report this as a bug if it occurs

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Verify all environment variables are set correctly
3. Ensure AdSense account is fully approved
4. Check AdSense dashboard for ad unit status

## 🔮 Future Enhancements

Potential improvements for later:
- Multiple ad placements (sidebar, between game cards)
- Video ads (rewarded ads for bonuses)
- A/B testing different ad formats
- Ad revenue analytics integration
