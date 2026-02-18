# Guia: Publicação na Google Play Store (PWA para Android)

Este documento resume os passos necessários para transformar a aplicação web KandalGym numa App oficial para a Google Play Store.

## 1. Requisitos Técnicos (Código)
Para que a App seja aceite e funcione sem barras de navegação (como uma App real), é necessário implementar a **Trusted Web Activity (TWA)**.

*   **Verificação de Domínio**: Criar o ficheiro `.well-known/assetlinks.json` no servidor.
*   **Manifesto**: O ficheiro `manifest.json` já está configurado com nome, ícones e cores oficiais.
*   **Service Worker**: O ficheiro `sw.js` já está configurado para permitir o funcionamento offline.

## 2. Infraestrutura (Alojamento)
A Google exige que a App seja servida através de um domínio seguro e público.
*   **HTTPS Obrigatório**: O site deve estar num endereço como `https://sua-marca.com`.
*   **Alojamento Sugerido**: GitHub Pages (Grátis), PythonAnywhere, ou servidor próprio com SSL.

## 3. Conta de Programador Google
*   **Registo**: Criar conta em [Play Console](https://play.google.com/console).
*   **Custo**: Taxa única de **$25 USD**.
*   **Validação**: Exige verificação de identidade oficial.

## 4. Método de Conversão Recomendado
Utilizar o **[PWABuilder.com](https://www.pwabuilder.com/)** (Ferramenta da Microsoft).
1.  Introduzir o URL do site online.
2.  Descarregar o pacote para Android.
3.  Seguir as instruções para gerar o ficheiro `.aab` (Android App Bundle).

---
*Dica: Guarde este ficheiro para quando decidir avançar com o registo oficial da marca nas lojas de aplicações.*
