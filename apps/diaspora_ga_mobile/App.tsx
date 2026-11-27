import React, { useEffect, useRef, useState } from "react"
import { ActivityIndicator, BackHandler, Button, Image, Linking, StatusBar, StyleSheet, Text, View, useColorScheme } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import { destination, feed, incoming } from "./navigation"

function Browser() {
  const dark = useColorScheme() === "dark"
  const colors = dark ? { backgroundColor: "#171411", color: "#eeeae3" } : { backgroundColor: "#faf8f4", color: "#262320" }
  const [consulate, setConsulate] = useState(false)
  const web = useRef<WebView>(null)
  const canGoBack = useRef(false)
  const [source, setSource] = useState<{ uri: string } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    let received = false
    const go = (url: string) => {
      setConsulate(false)
      setError(false)
      setSource({ uri: url })
    }
    const listener = Linking.addEventListener("url", event => {
      const url = incoming(event.url)
      if (url) { received = true; go(url) }
    })
    void Linking.getInitialURL().then(link => {
      if (live && !received) go(incoming(link) ?? feed)
    }).catch(() => { if (live && !received) go(feed) })
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current || !web.current) return false
      web.current.goBack()
      return true
    })
    return () => { live = false; listener.remove(); back.remove() }
  }, [])

  function loading() {
    return (
      <View style={[styles.overlay, { backgroundColor: colors.backgroundColor }]}>
        <Image source={dark ? require("./assets/diaspora-horizontal-inverse.png") : require("./assets/diaspora-horizontal.png")}
          resizeMode="contain" style={styles.signature} accessible accessibilityLabel="DIASPORA" />
        <ActivityIndicator accessibilityLabel="Ouverture de DIASPORA" />
      </View>
    )
  }

  function openExternal(url: string) {
    const target = new URL(url)
    if (target.origin === "https://consulat.ga" && target.pathname.replace(/\/$/, "") === "/my-space") {
      void Linking.openURL("consulatga:///").catch(() => setConsulate(true))
      return
    }
    void Linking.openURL(url).catch(() => setError(true))
  }
  return <SafeAreaView style={[styles.fill, { backgroundColor: colors.backgroundColor }]}>
    <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
    {source && <WebView ref={web} source={source} style={styles.fill} originWhitelist={["*"]}
      startInLoadingState renderLoading={loading}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never" thirdPartyCookiesEnabled={false} allowsInlineMediaPlayback allowsBackForwardNavigationGestures
      mediaCapturePermissionGrantType="grantIfSameHostElseDeny" setSupportMultipleWindows
      onNavigationStateChange={state => { canGoBack.current = state.canGoBack }}
      onShouldStartLoadWithRequest={req => {
        const kind = destination(req.url)
        if (kind === "outside" && req.isTopFrame !== false) openExternal(req.url)
        return kind === "inside"
      }}
      onOpenWindow={event => {
        const url = event.nativeEvent.targetUrl
        const kind = destination(url)
        if (kind === "outside") openExternal(url)
        if (kind === "inside") setSource({ uri: url })
      }}
      onContentProcessDidTerminate={() => web.current?.reload()}
      onRenderProcessGone={() => setError(true)}
      onError={() => setError(true)}
      onHttpError={e => { if (e.nativeEvent.statusCode >= 500) setError(true) }}
      renderError={() => <View />}
    />}
    {consulate && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundColor }]}>
      <Button title="Revenir à DIASPORA" onPress={() => setConsulate(false)} />
      <WebView source={{ uri: "https://consulat.ga/my-space" }} style={styles.fill}
        originWhitelist={["https://*"]} allowFileAccess={false} mixedContentMode="never"
        allowsBackForwardNavigationGestures />
    </View>}
    {!source && !error && loading()}
    {error && <View style={[styles.overlay, { backgroundColor: colors.backgroundColor }]}>
      <Image source={require("./assets/hirondelle.png")} resizeMode="contain" style={styles.brand} accessible={false} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.color }]}>DIASPORA est indisponible</Text>
      <Text style={{ color: colors.color }}>Vérifiez votre connexion puis réessayez.</Text>
      <Button title="Réessayer" onPress={() => { setError(false); web.current?.reload() }} />
    </View>}
  </SafeAreaView>
}

export default function App() { return <SafeAreaProvider><Browser /></SafeAreaProvider> }
const styles = StyleSheet.create({
  fill: { flex: 1 }, overlay: { ...StyleSheet.absoluteFill, padding: 24, gap: 16, alignItems: "center", justifyContent: "center" },
  signature: { width: "100%", maxWidth: 320, aspectRatio: 1430 / 211, height: undefined },
  brand: { width: 144, height: 96 },
  title: { fontSize: 22, fontWeight: "600" },
})
