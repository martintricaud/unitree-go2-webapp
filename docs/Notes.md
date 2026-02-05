
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

- Lancer l'enregistrement de la video
- Vérifier que c'est la bonne fenêtre qui est streamée à Thomas
- Allumer télécommande secondaire
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


  
| Action                                                                                              | Timestamp       | Repère                                | Note                                          |
| --------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------- | --------------------------------------------- |
| 🕹️ Demi tour pour se réaligner sur le rayon du cercle en visant entre jardin-avant et jardin-centre |                 |                                       |                                               |
| 🕹️ Avance droit jusqu'au cercle de 5m50                                                             |                 |                                       |                                               |
| 🕹️ Rotation anti-horaire                                                                            | 00:7"12         |                                       |                                               |
| 🕹️ Rotation horaire                                                                                 |                 |                                       |                                               |
| 🕹️ Suit un arc le long du cercle de 5m50, sur un angle de ~120º (jardin > lointain > cour)          |                 |                                       |                                               |
| 🕹️ Pivote pour se réaligner vers le centre du cercle                                                |                 |                                       |                                               |
| ⏭️ Stretch + Hello                                                                                  | 00:21 (8"58)    | *Just because...*                     |                                               |
| ⏭️ Front jump                                                                                       | 00:30"1 (3"56)  | *I'd be gentle...*                    |                                               |
| ⏭️ Front jump                                                                                       | 00:35"2  (3"56) | *Regarding...*                        |                                               |
| 🔘 Reactiver ClassicWalk                                                                            |                 |                                       |                                               |
| 🕹️ Rotation ~90º horaire                                                                            |                 | 🎶 **Trille musicale**                 |                                               |
| 🕹️ Déplacement latéral                                                                              |                 | *I'd be friends with the sparrows...* |                                               |
| 🕹️ Rotation ~180º horaire                                                                           |                 | *If I only had a heart*               |                                               |
| 🕹️ Coup de hanche à droite                                                                          |                 | *Picture me...*                       |$R9$                                          |
| 🕹️ Coup de hanche à gauche                                                                          |                 | *A balcony...*                        |$R3$                                          |
| 🕹️ Contorsion circulaire Joystick droit                                                             |                 | *Above, a voice sings low*            | $R3 \curvearrowleft R7$                       |
| 🕹️ Déhanché latéral gauche                                                                          |                 | *Wherefore art thou*                  | $L3 \uparrow L0 \leftarrow L9$                |
| 🕹️ Contorsion circulaire Joystick gauche                                                            |                 | *Romeo?*                              | $L9\circlearrowleft L9$                       |
| 🕹️ Squat                                                                                            |                 | *I hear a beat*                       | $L6$                                          |
| 🕹️ Twerk gauche - droite                                                                            |                 | 🎶 **Marimba beat**                   | $R0 \leftarrow R3 \uparrow R0 \rightarrow R3$ |
| 🔘 Reactiver ClassicWalk                                                                            |                 |                                       |                                               |
| 🕹️ Avance de quelque pas vers cour-avant                                                            |                 |                                       |                                               |
| 🔘 Handstand                                                                                        |                 | *Just to register*                    |                                               |
| 🔘 Retour sur pattes avant                                                                          |                 |                                       |                                               |
| 💜 Coeur                                                                                            |                 | *_If_ I only had a heart*             |                                               |
| ⏭️ Salto                                                                                            |                 | Avant *J'ai 12 moteurs*               |                                               |
### Monologue

- Angle de début = décalé de 1/4 de tour anti-horaire par rapport au magicien d'oz
- Juste après "je n'ai pas d'humour" 90deg vers la droite. Doit avoir arrêté de bouger à l'aboiement
- avance à partir de "*(dans n'importe quelle) **langue***" jusqu'à "***français***"
- à chaque langue qu'il égrenne, fait un micromouvement de réorientation
- après "***banglae***", il ne bouge pas
- recommence à bouger sur le glitch en tournant de quelque pas dans le sens horaire puis suit l'arc du cercle vers le lointain, et s'arrête à ~13:00 sur le mot "***politique***"
- reste sur place pendant "***je fais le bouffon***"
- envoie son fessier vers le centre sur "***je ne fais pas mes besoins***"
- pendant le silence qui suit recule vers le centre avec un créneau pour se retrouver de face
- il s'assied juste avant "***je peux tout pour vous***"
- il se relève de la position assise sur la voix accélérée "***je suis votre chose...***"
- depuis "***l'univers*** *(dans lequel j'évolue)*" jusqu'à "**plaisir**", tourne très lentement sur place dans le sens horaire
- passe en mode "bound" et se déplace comme un chien fou, jusqu'à la fin des halètements.
- reste sur place de "***je n'apprends pas***" jusqu'à "***archive***"
- ~~sur "***je vais vous confier mon secret***" longe le cercle dans le sens anti-horaire.~~
- sur le deuxième **Baby Shark** lancer `Dance 2` (bouton `Y`)
- sur ***cela fait une différence fondamentale***, allumage de la caméra

## Commandes

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
| Pose                     | 1028                       | Active le mode ou les angles d'Euler sont controlables                                                  | ✅     | Oui  |
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
<!-- b