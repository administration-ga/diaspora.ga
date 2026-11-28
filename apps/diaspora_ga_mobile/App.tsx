import React, { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Alert, BackHandler, Button, Image, Linking, Platform, Share, StatusBar, StyleSheet, Text, View, useColorScheme } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { destination, feed, incoming, missingConsulateEntry } from "./navigation"

import { installShareBridge, readShareRequest, smsComposerUrl } from "./share-links"

function Browser() {
  const dark = useColorScheme() === "dark"
  const signature = dark ? require("./assets/diaspora-horizontal-inverse.png") : require("./assets/diaspora-horizontal.png")
  const colors = dark ? { backgroundColor: "#171411", color: "#eeeae3" } : { backgroundColor: "#faf8f4", color: "#262320" }
  const [consulate, setConsulate] = useState(false)
  const web = useRef<WebView>(null)
  const canGoBack = useRef(false)
  const partnerOpen = useRef(false)
  const partnerOverlay = useRef(false)
  const activeShare = useRef(false)
  const [source, setSource] = useState<{ uri: string } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    let received = false
    const go = (url: string) => {
      partnerOpen.current = false
      partnerOverlay.current = false
      setConsulate(false)
      setError(false)
      setSource({ uri: url })
    }
    const listener = Linking.addEventListener("url", event => {
      const url = incoming(event.url)
      if (!url) return
      received = true
      if (partnerOpen.current && [incoming("diasporaga:///ouvrir"), incoming("https://diaspora.ga/mobile/ouvrir")].includes(url)) {
        partnerOpen.current = false
        partnerOverlay.current = false
        setConsulate(false)
        return
      }
      go(url)
    })
    void Linking.getInitialURL().then(link => {
      if (live && !received) go(incoming(link) ?? feed)
    }).catch(() => { if (live && !received) go(feed) })
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (partnerOverlay.current) {
        partnerOverlay.current = false
        partnerOpen.current = false
        setConsulate(false)
        return true
      }
      if (!canGoBack.current || !web.current) return false
      web.current.goBack()
      return true
    })
    return () => { live = false; listener.remove(); back.remove() }
  }, [])

  function loading() {
    return (
      <View style={[styles.overlay, { backgroundColor: colors.backgroundColor }]}>
        <Image source={signature}
          resizeMode="contain" style={styles.signature} accessible accessibilityLabel="DIASPORA" />
        <ActivityIndicator accessibilityLabel="Ouverture de DIASPORA" />
      </View>
    )
  }

  function openExternal(url: string) {
    const target = new URL(url)
    if (target.origin === "https://consulat.ga" && target.pathname.replace(/\/$/, "") === "/my-space") {
      partnerOpen.current = true
      void Linking.openURL("consulatga:///").catch(() => {
        partnerOverlay.current = true
        setConsulate(true)
      })
      return
    }
    void Linking.openURL(url).catch(() => Alert.alert("Ouverture impossible", "Aucune application disponible pour ouvrir ce lien."))
  }
  async function onShareMessage(event: WebViewMessageEvent) {
    const request = readShareRequest(event.nativeEvent.url, event.nativeEvent.data)
    if (!request) return
    const reply = (result: "opened" | "shared" | "cancelled" | "failed") => {
      const detail = JSON.stringify({ id: request.id, result })
      web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("diaspora-share-result", { detail: ${detail} })); true;`)
    }
    if (activeShare.current) { reply("failed"); return }
    activeShare.current = true
    try {
      if (request.action === "sms") {
        await Linking.openURL(smsComposerUrl(request.url, Platform.OS === "ios"))
        reply("opened")
      } else {
        const result = await Share.share({ title: request.title, message: request.url })
        reply(result.action === Share.dismissedAction ? "cancelled" : "shared")
      }
    } catch {
      reply("failed")
    } finally {
      activeShare.current = false
    }
  }
  return <SafeAreaView style={[styles.fill, { backgroundColor: colors.backgroundColor }]}>
    <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
    {source && <WebView ref={web} source={source} style={styles.fill} originWhitelist={["*"]}
      startInLoadingState renderLoading={loading}
      injectedJavaScriptBeforeContentLoaded={installShareBridge} injectedJavaScript={installShareBridge}
      onMessage={event => { void onShareMessage(event) }}
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
      onHttpError={({ nativeEvent }) => {
        const fallback = missingConsulateEntry(nativeEvent.statusCode, nativeEvent.url, source.uri)
        if (fallback) setSource({ uri: fallback })
        else if (nativeEvent.statusCode >= 500) setError(true)
      }}
      renderError={() => <View />}
    />}
    {consulate && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundColor }]}>
      <View style={styles.returnBar}>
        <Image source={require("./assets/hirondelle.png")} resizeMode="contain" style={styles.returnMark} accessible={false} />
        <Button title="Revenir à DIASPORA" onPress={() => { partnerOverlay.current = false; partnerOpen.current = false; setConsulate(false) }} />
      </View>
      <WebView source={{ uri: "https://consulat.ga/my-space" }} style={styles.fill}
        originWhitelist={["https://*"]} allowFileAccess={false} mixedContentMode="never"
        allowsBackForwardNavigationGestures />
    </View>}
    {!source && !error && loading()}
    {error && <View style={[styles.overlay, { backgroundColor: colors.backgroundColor }]}>
      <Image source={signature} resizeMode="contain" style={styles.signature} accessible={false} />
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
  returnBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  returnMark: { width: 30, height: 24 },
  title: { fontSize: 22, fontWeight: "600" },
})
