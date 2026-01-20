
## Notes 
- A partir de la version 1.1.7, toutes les fonctionnalités sont en principe unifiées sous un seul mode de contrôle du chien. Dans la pratique, il semble que ce ne soit pas le cas en 1.1.8.
- Les codes et noms de certaines méthodes et fonctions de l'API disponible via WebRTC changent à partir de 1.1.7 
- Lors du déclenchement d'action one-shot via l'API, il est nécessaire d'introduire un timeout
- Certaines actions déclenchées via l'API prennent le dessus sur les instructions sur les actions déclenchées par la télécommande (par exemple Wiggle Hips interrompt le mode "Pose"), mais elles sont bloquées si jamais une commande de mouvement est en cours de transmission par la télécommande.
- Le contrôle de l'angle de Pitch est possible en Running et en Normal mode, mais pas en Classic et FreeWalk


| Télécommande | API         | Commentaire                                                   |
| ------------ | ----------- | ------------------------------------------------------------- |
| Normal       | StaticWalk  | Plus rapide que le classic, pitch controllable, pas parasites |
| Classic      | ClassicWalk | Plus lent, pas de pitch control, pas de pas parasite          |
|              | Economic    | Comme le Normal/StaticWalk, mais plus lent                    |
| FreeWalk     | FreeWalk    | Mode par défaut                                               |
| Running      | TrotRun     |                                                               |


## Conduite

### Danse du Sabbat
| Action                                                                                              | Timestamp | Durée  | Repère                                | Note        |
| --------------------------------------------------------------------------------------------------- | --------- | ------ | ------------------------------------- | ----------- |
| Allumer enceinte                                                                                    |           |        |                                       |             |
| Connecter enceinte                                                                                  |           |        |                                       |             |
| Allumer le chien                                                                                    |           | 48"    |                                       |             |
| Connecter l'ordinateur au WIFI du chien                                                             |           |        |                                       |             |
| Lancer le serveur WebRTC                                                                            |           |        |                                       |             |
| Lancer l'interface de controle                                                                      |           |        |                                       |             |
| Connecter l'interface de contrôle au chien                                                          |           |        |                                       |             |
| Allumer la manette                                                                                  |           |        |                                       |             |
| Passer en mode de déplacement **FreeWalk**                                                          |           |        |                                       |             |
| Désactiver Obstacle Avoidance                                                                       |           |        |                                       |             |
| Passer en mode de déplacement **Classic**                                                           |           |        |                                       | à confirmer |
| Invocation de Mephisto (😈)                                                                         |           |        |                                       |             |
| 😈 Avancée de Mephisto sur scène                                                                    |           |        |                                       |             |
| 😈 Mephisto rôde autour des danseuses                                                               |           |        |                                       |             |
| 😈 Mephisto avance jusque au centre du cercle                                                       |           |        |                                       |             |
| 😈 Mephisto danse au milieu des danseuses                                                           |           |        |                                       |             |
| 😈 Mephisto se dresse sur ses pates arrière                                                         |           |        |                                       |             |
| 😈 Mephisto ajuste son orientation                                                                  |           |        |                                       |             |
| 😈 Mephisto retombe sur ses pates avant                                                             |           |        |                                       |             |
| Changer la couleur de la Headlight                                                                  |           |        |                                       |             |
| Passer en mode de déplacement **Classic**                                                           |           |        |                                       |             |

### Magicien d'Oz
| Action                                                                                              | Timestamp | Durée  | Repère                                | Note        |
| --------------------------------------------------------------------------------------------------- | --------- | ------ | ------------------------------------- | ----------- |
| 💜 Demi tour pour se réaligner sur le rayon du cercle en visant entre jardin-avant et jardin-centre |           |        |                                       |             |
| 💜 Avance droit jusqu'au cercle de 5m50                                                             |           |        |                                       |             |
| 💜 Pivote sur place de 180º vers la gauche                                                          | 7"12      |        |                                       |             |
| 💜 Pivote sur place de 180º vers la droite                                                          |           |        |                                       |             |
| 💜 Suit un arc le long du cercle de 5m50, sur un angle de ~120º (jardin > lointain > cour)          |           |        |                                       |             |
| 💜 Pivote pour se réaligner vers le centre du cercle                                                |           |        |                                       |             |
| 💜 Stretch + Hello                                                                                  | 21        | 8"58 | *Just because...*                     |             |
| 💜 Front jump                                                                                       | 30"1      | 3"56   | *I'd be gentle...*                    |             |
| 💜 Front jump                                                                                       | 35"2      | 3"56   | *Regarding...*                        |             |
| 💜 Reactiver ClassicWalk                                                                            |           |        |                                       |             |
| 💜 Rotation ~90º horaire                                                                            |           |        | Trille musicale                       |             |
| 💜 Déplacement latéral                                                                              |           |        | *I'd be friends with the sparrows...* |             |
| 💜 Rotation ~180º horaire                                                                           |           |        | *If I only had a heart*               |             |
| 💜 Déhanché circulaire                                                                              |           |        | *Picture me...*                       |             |
| 💜 Déhanché latéral                                                                                 |           |        | *Wherefore art thou, Romeo?*          |             |
| 💜 Mini twerk                                                                                       |           |        | *I hear a beat*                       |             |
| 💜 Reactiver ClassicWalk                                                                            |           |        |                                       |             |
| 💜 Avance de quelque pas vers cour-avant                                                            |           |        |                                       |             |
| 💜 Handstand                                                                                        |           |        | *Just to register*                    |             |
| 💜 Retour sur pattes avant                                                                          |           |        |                                       |             |
| 💜 Coeur                                                                                            |           |        | Lancer la commande sur *if*           |             |
| Salto                                                                                               |           |        | Avant *J'ai 12 moteurs*               |             |
### Monologue

## Commandes

Inconnues à ce stade: quels codes de l'API correspondent aux commandes "Classic", "Normal", "Running" sur la télécommande?

| Commande                 | Code API en 1.1.7          | Description                                                                                             | 1.1.7 | Utilisé                                                |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------ |
| Damp                     | 1001                       | Coupe les moteurs des articulations                                                                     | ✅     |                                                        |
| Balance Stand            | 1002                       | Mode debout par défaut (posture auto-équilibrée)                                                        | ✅     |                                                        |
| StopMove                 | 1003                       |                                                                                                         |       |                                                        |
| Stand Up                 | 1004                       | le chien se redresse depuis une position allongée                                                       | ✅     |                                                        |
| Stand Down / Crouch      | 1005                       | le chien s'allonge                                                                                      | ✅     |                                                        |
| Recovery Stand           | 1006                       | le chien se remet debout après une chute                                                                | ✅     | Oui *                                                  |
| Move                     | 1008                       | le chien se déplace avec l'amplitude et la direction spécifiés en paramètre                             | ✅     |                                                        |
| Sit                      | 1009                       | le chien se met en posture assise                                                                       | ✅     | Oui                                                    |
| RiseSit                  | 1010                       | le chien reprend une posture debout lorsqu'il était précédemment assis                                  | ✅     | Oui                                                    |
| SwitchGait               | 1011                       |                                                                                                         |       |                                                        |
| Hello                    | 1016                       | Le chien salue en agitant la pate                                                                       | ✅     | Oui                                                    |
| Stretch                  | 1017                       | Le chien s'étire                                                                                        | ✅     | Oui                                                    |
| Content                  | 1020                       | Le chien trépigne de joie en se balançant rapidement d'une patte avant sur l'autre                      | ✅     | ?                                                      |
| Wallow / Rollover        | 1021                       | Le chien se roule sur lui même                                                                          | ✅     |                                                        |
| Dance1                   | 1022                       | Danse préprogrammée nº1                                                                                 | ✅     | ?                                                      |
| Dance2                   | 1023                       | Danse préprogrammée nº2                                                                                 | ✅     |                                                        |
| Pose                     | 1028                       | Active le mode ou les angles d'Euler sont controlables                                                  | ✅     | Oui (mais potentiellement depuis la manette d'origine) |
| Scrape                   | 1029                       | Le chien s'assoit, joint les pattes                                                                     | ✅     |                                                        |
| Front Flip               | 1030                       | Salto avant                                                                                             | ✅     |                                                        |
| Front Jump               | 1031                       | Le chien effectue un bon vers l'avant                                                                   | ✅     |                                                        |
| Pounce                   | 1032                       | Le chien se cabre puis retombe en martelant le sol de ses pattes avant                                  | ✅     |                                                        |
| Wiggle Hips              | 1033                       | le chien se trémousse les hanches                                                                       | ❌     |                                                        |
| Backstand / Walk upright | 1039                       | Le chien se dresse sur ses pattes arrière                                                               | ✅     | Oui                                                    |
| Left Flip                | 1042                       | Salto à gauche                                                                                          | ✅     |                                                        |
| Right Flip               | 1043                       | Salto à droite                                                                                          | ❌     |                                                        |
| Back Flip                | 1044                       | Salto arrière                                                                                           | ✅     |                                                        |
| FreeWalk                 | 1045                       | Mode de déplacement le plus fluide                                                                      | ✅     | Oui                                                    |
| FreeJump                 | 1047                       | Active / Desactive le mode de déplacement par sauts à pied joints                                       | ✅     |                                                        |
| Handstand                | 1301                       | Le chien se dresse sur ses pattes avant                                                                 | ✅     | Oui                                                    |
| Cross Step               | 1302                       | le chien entre dans un mode de déplacement ou il est en équilibre sur ses pattes diagonalement opposées | ✅     |                                                        |
| Free Bound               | 1304                       | Active / Desactive le mode de déplacement par bonds                                                     | ✅     | Oui                                                    |
| TrotRun / Running        | Controle du pitch possible | ?                                                                                                       |       |                                                        |

## Controleur

| Keys                | Action      |
| ------------------- | ----------- |
| **L + ⬇️**           | Backflip    |
| **L + ⬆️**           | Frontflip   |
| **L + ⬅️**           | Leftflip    |
| **L + ➡️**           | Rightflip   |
| **L + ⊕**           |             |
| **ZL + RIGHTSTICK** | Pose        |
| **ZL + ⬆️**          | Handstand   |
| **ZL + ⬇️**          | Backstand   |
| **ZL + ➡️**          | CrossStep   |
| **ZL + ⬅️**          | SideStep    |
| X                   | Front Jump  |
| B                   | Stretch     |
| Y                   | Hello       |
| A                   | FingerHeart |
| ?+X                 | Pounce      |
| ?+B                 | Scrape      |
| ?+Y                 | Content     |
| ?+A                 |             |

Upon ZLRelease, if there hasn't been a button press and release between ZLPress and ZLRelease, call balanceStand, else do nothing.

If the last value of ZL is true, i.e. while ZL is pressed, pressing arrowTop toggles handStand, arrowDown to
