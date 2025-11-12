# Image Filters – Sharp Pipeline

Cada operador implementa um **filtro de imagem** usando a biblioteca [Sharp](https://sharp.pixelplumbing.com/api-operation/) — um toolkit de processamento de imagens para Node.js.

Cada função recebe e retorna uma instância `Sharp`, permitindo encadeamento no pipeline.

---

## `bw` — Preto & Branco com Mixer de Canais
[Documentação Sharp – recomb()](https://sharp.pixelplumbing.com/api-colour/#recomb) · [linear()](https://sharp.pixelplumbing.com/api-operation/#linear) · [toColourspace()](https://sharp.pixelplumbing.com/api-colour/#tocolourspace)

**Descrição:**  
Converte a imagem em tons de cinza, permitindo ajustar o peso relativo de cada canal RGB e de suas combinações secundárias (Y, C, M).  
É possível controlar a influência da mistura personalizada (`strength`) e o contraste final (`contrast`).

**Parâmetros:**
- `r, y, g, c, b, m` — pesos (0–200) de cada canal.  
- `strength` — mistura (0–100) entre neutro (1/3,1/3,1/3) e pesos definidos.  
- `contrast` — contraste (-50 a +50).

**Funcionamento:**
1. Calcula pesos normalizados para R, G e B.  
2. Interpola entre os pesos neutros e os personalizados via `strength`.  
3. Combina os canais manualmente e aplica o contraste.

**Usos comuns:**  
- Clarear tons de pele: aumentar `R` e `Y`.  
- Escurecer céu: reduzir `B`.  
- Realçar vegetação: aumentar `G`.

---

## `bc` — Brightness & Contrast
[Documentação Sharp – modulate()](https://sharp.pixelplumbing.com/api-colour/#modulate) · [linear()](https://sharp.pixelplumbing.com/api-operation/#linear)

**Descrição:**  
Ajusta brilho e contraste global da imagem de forma linear.

**Parâmetros:**  
- `b` — brilho (-150 a +150 %).  
- `c` — contraste (-150 a +150 %).

**Funcionamento:**  
- `modulate()` altera o brilho global.  
- `linear()` aplica contraste em torno de 128.

**Usos comuns:**  
- Melhorar fotos escuras ou lavadas.  
- Ajuste rápido após conversão em PB.

---

## `shadows` — Elevação de Sombras Seletiva
[Documentação Sharp – gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur) · [composite()](https://sharp.pixelplumbing.com/api-composite/#composite)

**Descrição:**  
Clareia seletivamente as regiões escuras, sem afetar as áreas claras.

**Parâmetros:**  
- `intensity` — força da iluminação (0–100).  
- `width` — faixa tonal afetada (1–100).  
- `radius` — suavização da máscara (1–200).

**Funcionamento:**  
1. Cria máscara invertida com base nas áreas escuras.  
2. Aplica `gamma()` e `blur()` para suavizar.  
3. Usa `composite()` para sobrepor a versão clareada.

**Usos comuns:**  
- Recuperar detalhes em sombras sem perder contraste.

---

## `highlights` — Recuperação de Altas Luzes
[Documentação Sharp – gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur) · [composite()](https://sharp.pixelplumbing.com/api-composite/#composite)

**Descrição:**  
Escurece seletivamente regiões muito claras para recuperar textura e detalhes.

**Parâmetros:**  
- `intensity` — força do corte (0–100).  
- `width` — faixa tonal (1–100).  
- `radius` — suavização (1–200).

**Funcionamento:**  
1. Gera máscara focando áreas brilhantes.  
2. Escurece a imagem proporcionalmente à máscara.  
3. Compõe a versão corrigida sobre a original.

**Usos comuns:**  
- Corrigir reflexos, céu estourado ou superfícies brancas sem textura.

---

## `exposure` — EV / Offset / Gamma
[Documentação Sharp – linear()](https://sharp.pixelplumbing.com/api-operation/#linear) · [gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma)

**Descrição:**  
Simula ajuste de exposição fotográfica real — brilho em EV, offset e curva de tons médios (`gamma`).

**Parâmetros:**  
- `ev` — variação de exposição (2^ev).  
- `offset` — adição direta (0–1).  
- `gamma` — curva de contraste (0.5–3).

**Funcionamento:**  
1. `linear()` ajusta brilho global e deslocamento.  
2. `gamma()` modela contraste nos médios tons.  
3. Implementa fallback quando `γ < 1` para clarear de forma estável.

**Usos comuns:**  
- Ajustar exposição antes de aplicar `shadows`, `highlights` ou `bc`.

---

## `levelsOut` — Faixa Tonal de Saída
[Documentação Sharp – linear()](https://sharp.pixelplumbing.com/api-operation/#linear)

**Descrição:**  
Remapeia a faixa tonal de saída, definindo novos valores de preto e branco.

**Parâmetros:**  
- `lo` — valor do preto (0–255).  
- `hi` — valor do branco (0–255).

**Funcionamento:**  
Aplica `linear(a, b)` com `a=(hi−lo)/255` e `b=lo`.

**Usos comuns:**  
- Reduzir contraste (efeito “flat”).  
- Preparar imagens para impressão.

---

## `normalize` — Normalização Automática
[Documentação Sharp – normalize()](https://sharp.pixelplumbing.com/api-operation/#normalize)

**Descrição:**  
Ajusta automaticamente brilho e contraste para expandir o histograma da imagem.

**Parâmetros:**  
- `black` — corte de sombra (%).  
- `white` — corte de luz alta (%).

**Funcionamento:**  
Executa `normalize({ lower, upper })` com base nos percentuais.

**Usos comuns:**  
- Corrigir fotos lavadas ou com contraste baixo.

---

## `denoise` — Redução de Ruído
[Documentação Sharp – median()](https://sharp.pixelplumbing.com/api-operation/#median) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur)

**Descrição:**  
Reduz ruídos finos e granulação usando filtros de mediana e desfoque leve.

**Parâmetros:**  
- `level` — intensidade (0–10).

**Funcionamento:**  
- Aplica `median(3)` para suavizar ruídos.  
- Combina com `blur()` progressivo conforme o nível.

**Usos comuns:**  
- Reduzir granulação de ISO alto ou artefatos JPEG.

---

## `sharpen` — Nitidez / Afiar
[Documentação Sharp – sharpen()](https://sharp.pixelplumbing.com/api-operation/#sharpen)

**Descrição:**  
Aumenta o contraste em bordas, melhorando definição e textura.

**Parâmetros:**  
- `amount` — força (0–5).

**Funcionamento:**  
Aplica `sharpen(sigma, m1, m2)` com `sigma ≈ 0.8 + amount`.

**Usos comuns:**  
- Melhorar definição de detalhes após redução de ruído.

---

## `aiEnhance` — Aumento de Resolução (upscale 2×)
[Documentação Sharp – resize()](https://sharp.pixelplumbing.com/api-resize/#resize)

**Descrição:**  
Aumenta a resolução em até 2× usando interpolação `lanczos3`, respeitando limites máximos de 6000 px e 16 megapixels.

**Parâmetros:**  
- `enabled` — ativa ou desativa o upscale.  
- `meta0.width/height` — base de cálculo.

**Funcionamento:**  
Duplica a imagem mantendo proporção e nitidez.

**Usos comuns:**  
- Ampliar fotos pequenas antes de exportar para impressão ou edição detalhada.
