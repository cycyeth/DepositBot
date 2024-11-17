const ethers = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // Pour effectuer des requêtes HTTP

// Configuration du bot Telegram
const token = '7411789516:AAHGxoSO6jPlt9X0yfoaJCjr6epZzXAnHyM';
const bot = new TelegramBot(token, { polling: true });

// Configuration du fournisseur via le réseau Base
const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');

// Adresse du contrat du protocole
const protocolContractAddress = '0x2cF88805B665E2F14244065c8317eEa29967118A';

// ABI minimal incluant les fonctions de dépôt
const protocolAbi = [
  "function depositETH(uint256 minAmount, address ref) payable",
  "function depositBrett(uint256 amount, address ref)",
  "function depositBrettWithProof(uint256 amount, address ref, bytes32[] proof)"
];

// Adresse du contrat $BRETT sur Base
const brettTokenAddress = '0x532f27101965dd16442e59d40670faf5ebb142e4';

// Contrat du protocole
const protocolContract = new ethers.Contract(protocolContractAddress, protocolAbi, provider);

// URL de l'image à afficher
const imageUrl = 'https://imgur.com/a/MQseUlz';

// Fonction pour obtenir le prix actuel de $BRETT
async function getBrettPrice() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/base', {
      params: {
        contract_addresses: brettTokenAddress,
        vs_currencies: 'usd'
      }
    });
    const price = response.data[brettTokenAddress.toLowerCase()]?.usd;
    if (!price) {
      console.error("Impossible de récupérer le prix de $BRETT depuis CoinGecko.");
      return null; // Retourne null si le prix est introuvable
    }
    console.log(`Prix actuel de $BRETT : $${price}`);
    return price;
  } catch (err) {
    console.error("Erreur lors de la récupération du prix de $BRETT :", err.message);
    return null; // Retourne null en cas d'erreur
  }
}

// Fonction pour surveiller et analyser les transactions
provider.on('block', async (blockNumber) => {
  console.log(`Analyse des transactions dans le bloc ${blockNumber}...`);
  try {
    const block = await provider.getBlockWithTransactions(blockNumber);

    block.transactions.forEach(async (transaction) => {
      if (transaction.to && transaction.to.toLowerCase() === protocolContractAddress.toLowerCase()) {
        try {
          const decodedData = protocolContract.interface.parseTransaction({
            data: transaction.data,
            value: transaction.value,
          });

          let spentInUSD;
          let convertedToBrett;
          let message;
          let inlineKeyboard;

          switch (decodedData.name) {
            case 'depositETH':
              const ethAmount = ethers.utils.formatEther(transaction.value);
              spentInUSD = (parseFloat(ethAmount) * 1800 * 1.66).toFixed(2); // Conversion ETH en $ multiplié par 1.66
              const brettPrice = await getBrettPrice();
              if (!brettPrice) {
                convertedToBrett = "Prix indisponible";
              } else {
                convertedToBrett = (spentInUSD / brettPrice).toFixed(2); // Conversion en $BRETT sans multiplication
              }
              message = `**New BrettMiner Deposit!**\n\n💸 *Spent*: $${spentInUSD} (≈ ${convertedToBrett} $BRETT)`;
              inlineKeyboard = [
                [
                  { text: '👤 Buyer', url: `https://basescan.org/address/${transaction.from}` },
                  { text: '🔗 Tx', url: `https://basescan.org/tx/${transaction.hash}` }
                ],
                [
                  { text: '💰 Deposit $BRETT', url: 'https://github.com/cycyeth/BrettMinerDapp' }
                ]
              ];
              break;

            case 'depositBrett':
            case 'depositBrettWithProof':
              const brettAmount = ethers.utils.formatUnits(decodedData.args[0], 18); // $BRETT sans multiplication
              const brettPriceForBrett = await getBrettPrice();
              if (!brettPriceForBrett) {
                spentInUSD = "Prix indisponible";
              } else {
                spentInUSD = (parseFloat(brettAmount) * brettPriceForBrett).toFixed(2);
              }
              message = `**New BrettMiner Deposit!**\n\n💸 *Spent*: $${spentInUSD} (≈ ${brettAmount} $BRETT)`;
              inlineKeyboard = [
                [
                  { text: '👤 Buyer', url: `https://basescan.org/address/${transaction.from}` },
                  { text: '🔗 Tx', url: `https://basescan.org/tx/${transaction.hash}` }
                ],
                [
                  { text: '💰 Deposit $BRETT', url: 'https://github.com/cycyeth/BrettMinerDapp' }
                ]
              ];
              break;

            default:
              console.log(`Transaction non reconnue : ${transaction.hash}`);
              return;
          }

          // Envoyer l'image avec le message et les boutons inline
          bot.sendPhoto('-1002353442289', imageUrl, {
            caption: message,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: inlineKeyboard
            }
          })
            .then(() => console.log(`Message envoyé avec image et boutons : ${message}`))
            .catch(err => console.error("Erreur lors de l'envoi du message Telegram :", err));
        } catch (err) {
          console.error(`Erreur lors du décodage de la transaction ${transaction.hash} :`, err);
        }
      }
    });
  } catch (err) {
    console.error("Erreur lors de l'analyse du bloc :", err);
  }
});

// Gestion des erreurs du provider
provider.on('error', (error) => {
  console.error("Erreur du provider: ", error);
});

// Gestion des erreurs de polling Telegram
bot.on('polling_error', (error) => {
  console.error("Erreur de polling Telegram: ", error);
});
