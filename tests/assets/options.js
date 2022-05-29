/* eslint-disable */
module.exports = {
  options: ({baseValue = 100}) => { return {
    'overlapSensitivity': 2e-5,
    'overlapResolutionIterations': 50,
    'strokeWidth': 6,
    'gradientOffset': 0,
    'wedgeBaseWidth': baseValue * 0.3,
    'dashedWedgeSpacing': baseValue * 0.06,
    'bondThickness': baseValue * 0.6,
    'bondLength': baseValue * 2,
    'shortBondLength': 0.7,
    'bondSpacing': baseValue * 0.3,
    'font': 'Roboto Mono',
    'fontWeight': '600',
    'fontSizeLarge': baseValue * 0.8,
    'fontSizeSmall': baseValue * 0.5,
    'padding': baseValue * 0.6,
    'terminalCarbons': true,
    'explicitHydrogens': true,
  }}
}