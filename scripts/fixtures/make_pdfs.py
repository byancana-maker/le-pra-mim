import sys
from reportlab.lib.pagesizes import A4
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, FrameBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY

out = sys.argv[1]
W, H = A4
body = ParagraphStyle('b', fontName='Times-Roman', fontSize=10, leading=13, alignment=TA_JUSTIFY, spaceAfter=6)
h1 = ParagraphStyle('h1', fontName='Times-Bold', fontSize=16, leading=20, spaceAfter=10)
h2 = ParagraphStyle('h2', fontName='Times-Bold', fontSize=12, leading=15, spaceBefore=8, spaceAfter=6)

def header_footer(c, d):
    c.saveState()
    c.setFont('Times-Italic', 8)
    c.drawString(40, H-28, 'Revista Brasileira de Testes Acústicos - v. 3')
    c.setFont('Times-Roman', 9)
    c.drawCentredString(W/2, 24, str(d.page))
    c.restoreState()

# ---------- artigo científico, duas colunas ----------
doc = BaseDocTemplate(out + '/artigo.pdf', pagesize=A4, title='Efeito do ruído urbano na atenção de estudantes')
gap = 18
colw = (W - 80 - gap) / 2
frames = [Frame(40, 50, colw, H-110, id='l', leftPadding=0, rightPadding=0), Frame(40+colw+gap, 50, colw, H-110, id='r', leftPadding=0, rightPadding=0)]
doc.addPageTemplates([PageTemplate(id='two', frames=frames, onPage=header_footer)])
par = ("Os resultados indicam que a variação observada não é explicada apenas pelo tamanho da amostra (Silva et al., 2020). "
       "Estudos anteriores [1, 2] já haviam apontado efeito semelhante em escolas próximas a avenidas movimentadas. "
       "Segundo Souza e Lima (2019), a exposição prolongada reduz a atenção sustentada, conforme a Fig. 2 e o Dr. Almeida. "
       "Na amostra, 45% dos alunos relataram dificuldade, e o custo médio foi de R$ 1.250,50 por escola; cf. p. 12.")
story = [Paragraph('Efeito do ruído urbano na atenção de estudantes', h1), Paragraph('Resumo', h2)]
story += [Paragraph(par, body) for _ in range(3)]
for sec in ['Introdução', 'Métodos', 'Resultados', 'Discussão']:
    story.append(Paragraph(sec, h2))
    story += [Paragraph(par, body) for _ in range(7)]
story.append(Paragraph('Referências', h2))
story += [Paragraph('SILVA, J. et al. Ruído e atenção. Revista de Testes, v. 3, p. 1-10, 2020.', body) for _ in range(6)]
doc.build(story)

# ---------- romance, uma coluna, recuo de parágrafo e falas ----------
doc2 = BaseDocTemplate(out + '/romance.pdf', pagesize=A4, title='A casa da praia')
doc2.addPageTemplates([PageTemplate(id='one', frames=[Frame(60, 60, W-120, H-130, id='f')], onPage=header_footer)])
ind = ParagraphStyle('i', fontName='Times-Roman', fontSize=12, leading=18, firstLineIndent=22, spaceAfter=0)
story2 = [Paragraph('CAPÍTULO 1', h1)]
txt = [
 "Ela hesitou na porta, olhou para trás uma última vez e sorriu sem saber por quê. O mar quebrava longe, e a casa cheirava a sal e a madeira velha.",
 "— Você veio mesmo — disse Marcos, sem levantar os olhos do café. — Achei que ia desistir no caminho.",
 "— Pensei nisso. Pensei muito, na verdade! Mas a estrada estava vazia e o rádio tocava aquela música.",
 "Ele riu baixinho. Lá fora, o vento empurrava a cortina para dentro da sala, e as gaivotas gritavam sobre o telhado, indiferentes a tudo o que os dois ainda não sabiam dizer um ao outro naquela manhã tão clara.",
]
for _ in range(14):
    for t in txt:
        story2.append(Paragraph(t, ind))
doc2.build(story2)
print('ok')
